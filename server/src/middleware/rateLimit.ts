// 内存限流（固定窗口）。单实例部署够用；重启后计数清零，对“防暴力猜口令”这个目的影响不大。
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';

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
      return c.json({ error: { code: 'RATE_LIMITED', message: '尝试次数过多，请稍后再试' } }, 429);
    }
    await next();
  };
}
