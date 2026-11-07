// 内存限流（固定窗口）。单实例部署够用；重启后计数清零。
// 手册 §4.2 不设站点口令，这里按「IP + 路由」挡住扫接口和刷分享（阈值见手册 §6）。
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, Hono, MiddlewareHandler } from 'hono';

/** 与手册 §6 的限流表一致。测试与入口都引用这里，避免两处各写一份数字。 */
export const API_RATE_LIMITS = {
  windowMs: 60_000,
  searchPerMin: 60,
  /** discover 每次都 ORDER BY random()，比搜索重，阈值更低 */
  discoverPerMin: 30,
  lineReadPerMin: 60,
  createSharePerMin: 10,
  /** 打开分享页；与 line 读同级，防刷 view_count */
  readSharePerMin: 60,
  metricsEventsPerMin: 120,
} as const;

/**
 * 取客户端 IP，用作限流的 key。
 * 线上服务总在反向代理（Render / Cloudflare）后面，代理会把真实来源追加在 X-Forwarded-For 的末尾；
 * 前面的各项是客户端自己写的、可以随便伪造，所以只信最后一项——否则攻击者每次换一个假 IP 就能绕过限流。
 * 代价是代理链里多一层时，不同用户可能落进同一个桶，对自用站点可以接受。
 */
export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const last = xff.split(',').at(-1)?.trim();
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // 单测里用 app.request() 没有真实连接，取不到地址；落到同一个桶即可
    return 'unknown';
  }
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** 时钟可注入，测试里不必真的等一分钟 */
  now?: () => number;
  keyOf?: (c: Context) => string;
}

export function createRateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const now = opts.now ?? Date.now;
  const keyOf = opts.keyOf ?? clientIp;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  // 过期的桶不会自己消失；key 来自外部，必须有上限，否则被刷不同 IP 会撑爆内存
  const SWEEP_THRESHOLD = 10_000;
  function sweep(t: number): void {
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  }

  return async (c, next) => {
    const t = now();
    if (buckets.size >= SWEEP_THRESHOLD) sweep(t);

    const key = keyOf(c);
    let b = buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + opts.windowMs };
      buckets.set(key, b);
    }
    b.count++;

    if (b.count > opts.max) {
      // 这里直接返回响应而不是抛 AppError：需要附带 Retry-After 头，AppError 只携带状态码与消息
      c.header('Retry-After', String(Math.max(1, Math.ceil((b.resetAt - t) / 1000))));
      return c.json({ error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } }, 429);
    }
    await next();
  };
}

/**
 * 把 §6 的限流挂到对应路由上。
 * 桶的 key 用路由模板而不是具体 id：否则每次换一个 lineId 就是新桶，扫库不受限。
 */
export function mountApiRateLimits(app: Hono, now?: () => number): void {
  const { windowMs } = API_RATE_LIMITS;
  const byRoute = (route: string) => (c: Context) => `${clientIp(c)} ${route}`;

  app.use(
    '/api/search',
    createRateLimit({ windowMs, max: API_RATE_LIMITS.searchPerMin, now, keyOf: byRoute('GET /api/search') }),
  );
  app.use(
    '/api/discover',
    createRateLimit({ windowMs, max: API_RATE_LIMITS.discoverPerMin, now, keyOf: byRoute('GET /api/discover') }),
  );
  app.use(
    '/api/lines/:id/play',
    createRateLimit({
      windowMs,
      max: API_RATE_LIMITS.lineReadPerMin,
      now,
      keyOf: byRoute('GET /api/lines/:id/play'),
    }),
  );
  app.use(
    '/api/lines/:id/context',
    createRateLimit({
      windowMs,
      max: API_RATE_LIMITS.lineReadPerMin,
      now,
      keyOf: byRoute('GET /api/lines/:id/context'),
    }),
  );

  const createShare = createRateLimit({
    windowMs,
    max: API_RATE_LIMITS.createSharePerMin,
    now,
    keyOf: byRoute('POST /api/shares'),
  });
  app.use('/api/shares', async (c, next) => {
    // 前缀匹配会落到 /api/shares/:id；只对创建接口计数
    if (c.req.method !== 'POST' || c.req.path !== '/api/shares') return next();
    return createShare(c, next);
  });

  const readShare = createRateLimit({
    windowMs,
    max: API_RATE_LIMITS.readSharePerMin,
    now,
    keyOf: byRoute('GET /api/shares/:id'),
  });
  app.use('/api/shares/:id', async (c, next) => {
    if (c.req.method !== 'GET') return next();
    // 更具体的 play 子路径有独立桶
    if (/\/lines\/\d+\/play$/i.test(c.req.path)) return next();
    return readShare(c, next);
  });

  app.use(
    '/api/shares/:id/lines/:lineId/play',
    createRateLimit({
      windowMs,
      max: API_RATE_LIMITS.lineReadPerMin,
      now,
      keyOf: byRoute('GET /api/shares/:id/lines/:lineId/play'),
    }),
  );

  app.use(
    '/api/metrics/events',
    createRateLimit({
      windowMs,
      max: API_RATE_LIMITS.metricsEventsPerMin,
      now,
      keyOf: byRoute('POST /api/metrics/events'),
    }),
  );
}
