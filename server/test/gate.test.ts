// 门禁测试：口令校验、cookie 签发与验证、免口令白名单、限流。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { errorHandler, notFoundHandler } from '../src/lib/httpError.js';
import { createGate, createGateSession, isPublicRoute } from '../src/middleware/gate.js';
import { createRateLimit } from '../src/middleware/rateLimit.js';
import { createAuthRoutes } from '../src/routes/auth.js';
import { createAuthService } from '../src/services/authService.js';

const SECRET = 'x'.repeat(40);

function setup(opts: { passcode?: string; secret?: string; secure?: boolean; max?: number; now?: () => number } = {}) {
  const auth = createAuthService({ passcode: opts.passcode ?? 'open-sesame', cookieSecret: opts.secret ?? SECRET });
  const session = createGateSession(auth, { secret: opts.secret ?? SECRET, secure: opts.secure ?? false });
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.use('/api/*', createGate(session));
  app.use('/media/*', createGate(session));
  app.use('/api/auth', createRateLimit({ windowMs: 60_000, max: opts.max ?? 10, now: opts.now }));
  app.route('/api/auth', createAuthRoutes(auth, session));
  app.get('/api/search', (c) => c.json({ items: [] }));
  app.get('/media/tbbt/S01E01.mp4', (c) => c.text('video'));
  app.post('/api/shares', (c) => c.json({ id: 'abcd1234' }, 201));
  app.get('/api/shares/abcd1234', (c) => c.json({ id: 'abcd1234' }));
  app.get('/api/shares/abcd1234/lines/5/play', (c) => c.json({ url: 'signed://x' }));
  return { app };
}

const login = (app: Hono, passcode: unknown, raw = false) =>
  app.request('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (passcode as string) : JSON.stringify({ passcode }),
  });

/** 从 Set-Cookie 里取出 “名=值”，原样放回 Cookie 请求头，模拟浏览器 */
function cookieOf(res: Response): string {
  const set = res.headers.get('set-cookie');
  assert.ok(set, '响应里应该有 Set-Cookie');
  return set.split(';')[0]!;
}

test('白名单：只有 healthz、auth、分享的两个 GET 免口令', () => {
  assert.equal(isPublicRoute('GET', '/healthz'), true);
  assert.equal(isPublicRoute('POST', '/api/auth'), true);
  assert.equal(isPublicRoute('GET', '/api/auth'), false);
  assert.equal(isPublicRoute('GET', '/api/shares/aB3dE9xZ'), true);
  assert.equal(isPublicRoute('HEAD', '/api/shares/aB3dE9xZ'), true);
  assert.equal(isPublicRoute('GET', '/api/shares/aB3dE9xZ/lines/12345/play'), true);
  // 创建分享需要口令
  assert.equal(isPublicRoute('POST', '/api/shares'), false);
  assert.equal(isPublicRoute('POST', '/api/shares/aB3dE9xZ'), false);
  // 其余接口一律不在白名单
  for (const p of ['/api/search', '/api/episodes', '/api/lines/1/play', '/api/lines/1/context', '/media/tbbt/S01E01.mp4']) {
    assert.equal(isPublicRoute('GET', p), false, p);
  }
});

test('白名单：路径花样不能蹭过门禁', () => {
  for (const p of [
    '/api/shares/',
    '/api/shares/abc/../../search',
    '/api/shares/abc%2F..%2Fsearch',
    '/api/shares/abc/lines/x/play',
    '/api/shares/abc/lines/1/play/extra',
    '/api/shares/abc/context',
    '/api/shares//lines/1/play',
  ]) {
    assert.equal(isPublicRoute('GET', p), false, p);
  }
});

test('没有 cookie：受保护接口返回 401 UNAUTHORIZED（统一错误格式）', async () => {
  const { app } = setup();
  for (const [method, path] of [
    ['GET', '/api/search?q=a'],
    ['GET', '/media/tbbt/S01E01.mp4'],
    ['POST', '/api/shares'],
    ['GET', '/api/不存在的接口'],
  ] as const) {
    const res = await app.request(path, { method });
    assert.equal(res.status, 401, `${method} ${path}`);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'UNAUTHORIZED');
  }
});

test('免口令接口：healthz 与分享读取无需 cookie', async () => {
  const { app } = setup();
  for (const path of ['/healthz', '/api/shares/abcd1234', '/api/shares/abcd1234/lines/5/play']) {
    assert.equal((await app.request(path)).status, 200, path);
  }
});

test('口令正确：返回 200 并写入 HttpOnly 的签名 cookie，带上它即可通过门禁', async () => {
  const { app } = setup();
  const res = await login(app, 'open-sesame');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const set = res.headers.get('set-cookie')!;
  assert.match(set, /^ds_gate=/);
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  assert.match(set, /Max-Age=2592000/i);
  assert.match(set, /Path=\//);
  assert.doesNotMatch(set, /Secure/i, '非生产环境不加 Secure，否则 http://localhost 收不到 cookie');

  const cookie = cookieOf(res);
  assert.equal((await app.request('/api/search?q=a', { headers: { cookie } })).status, 200);
  assert.equal((await app.request('/media/tbbt/S01E01.mp4', { headers: { cookie } })).status, 200);
  assert.equal((await app.request('/api/shares', { method: 'POST', headers: { cookie } })).status, 201);
});

test('生产环境：cookie 带 Secure', async () => {
  const { app } = setup({ secure: true });
  const res = await login(app, 'open-sesame');
  assert.match(res.headers.get('set-cookie')!, /Secure/i);
});

test('口令错误：401 INVALID_PASSCODE，且不发 cookie', async () => {
  const { app } = setup();
  const res = await login(app, 'wrong');
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'INVALID_PASSCODE');
  assert.equal(res.headers.get('set-cookie'), null);
});

test('请求体不合法：400', async () => {
  const { app } = setup();
  assert.equal((await login(app, '{not json', true)).status, 400);
  assert.equal((await login(app, undefined)).status, 400); // 缺 passcode
  assert.equal((await login(app, '')).status, 400);
  assert.equal((await login(app, 12345)).status, 400);
  assert.equal((await login(app, 'x'.repeat(201))).status, 400);
  assert.equal((await login(app, '[]', true)).status, 400);
});

test('被篡改或伪造的 cookie：401', async () => {
  const { app } = setup();
  const good = cookieOf(await login(app, 'open-sesame'));
  const tampered = good.slice(0, -3) + (good.endsWith('AAA') ? 'BBB' : 'AAA');
  for (const cookie of [tampered, 'ds_gate=forged', 'ds_gate=forged.signature', 'other=1']) {
    assert.equal((await app.request('/api/search?q=a', { headers: { cookie } })).status, 401, cookie);
  }
});

test('修改口令后，旧 cookie 失效', async () => {
  const before = setup({ passcode: 'old-pass' });
  const cookie = cookieOf(await login(before.app, 'old-pass'));
  // 同一个签名密钥、换了口令：签名依旧有效，但凭证值对不上
  const after = setup({ passcode: 'new-pass' });
  assert.equal((await after.app.request('/api/search?q=a', { headers: { cookie } })).status, 401);
});

test('修改签名密钥后，旧 cookie 失效', async () => {
  const before = setup({ secret: 'a'.repeat(40) });
  const cookie = cookieOf(await login(before.app, 'open-sesame'));
  const after = setup({ secret: 'b'.repeat(40) });
  assert.equal((await after.app.request('/api/search?q=a', { headers: { cookie } })).status, 401);
});

test('限流：同一 IP 每分钟第 11 次起返回 429 并带 Retry-After，窗口过后恢复', async () => {
  let t = 1_000_000;
  const { app } = setup({ now: () => t });
  for (let i = 0; i < 10; i++) assert.equal((await login(app, 'wrong')).status, 401);

  const blocked = await login(app, 'open-sesame'); // 超限后连正确口令也要拦，否则限流形同虚设
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as { error: { code: string } }).error.code, 'RATE_LIMITED');
  const retry = Number(blocked.headers.get('retry-after'));
  assert.ok(retry >= 1 && retry <= 60, `Retry-After=${retry}`);

  t += 60_001;
  assert.equal((await login(app, 'open-sesame')).status, 200);
});

test('限流：不同 IP 互不影响；只信 X-Forwarded-For 的最后一项', async () => {
  const { app } = setup({ max: 2 });
  const from = (xff: string) =>
    app.request('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
      body: JSON.stringify({ passcode: 'wrong' }),
    });

  assert.equal((await from('1.1.1.1')).status, 401);
  assert.equal((await from('1.1.1.1')).status, 401);
  assert.equal((await from('1.1.1.1')).status, 429);
  // 换一个来源 IP 不受影响
  assert.equal((await from('2.2.2.2')).status, 401);
  // 前面的项是客户端伪造的：最后一项没变，就仍然是同一个桶
  assert.equal((await from('9.9.9.9, 1.1.1.1')).status, 429);
});
