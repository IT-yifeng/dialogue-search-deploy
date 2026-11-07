// 手册 §6：按「IP + 路由」限流。用假时钟，不必真的等一分钟。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { API_RATE_LIMITS, mountApiRateLimits } from '../src/middleware/rateLimit.js';

function setup() {
  let t = 1_000_000;
  const app = new Hono();
  mountApiRateLimits(app, () => t);
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/api/search', (c) => c.json({ ok: true }));
  app.get('/api/discover', (c) => c.json({ ok: true }));
  app.get('/api/episodes', (c) => c.json({ ok: true }));
  app.get('/api/lines/:id/play', (c) => c.json({ id: c.req.param('id') }));
  app.get('/api/lines/:id/context', (c) => c.json({ id: c.req.param('id') }));
  app.post('/api/shares', (c) => c.json({ ok: true }, 201));
  app.get('/api/shares/:id', (c) => c.json({ id: c.req.param('id') }));
  app.get('/api/shares/:id/lines/:lineId/play', (c) => c.json({ ok: true }));
  app.post('/api/metrics/events', (c) => c.body(null, 204));
  return {
    app,
    advance(ms: number) {
      t += ms;
    },
  };
}

async function statuses(app: Hono, n: number, path: string, init?: RequestInit): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((await app.request(path, init)).status);
  return out;
}

test('搜索：第 61 次 429，并带 Retry-After 与 RATE_LIMITED', async () => {
  const { app } = setup();
  const codes = await statuses(app, API_RATE_LIMITS.searchPerMin, '/api/search?q=a');
  assert.ok(codes.every((s) => s === 200));
  const last = await app.request('/api/search?q=b');
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) >= 1);
  const body = (await last.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'RATE_LIMITED');
});

test('不同路由各自计数：discover 打满后搜索仍可用', async () => {
  const { app } = setup();
  const discover = await statuses(app, API_RATE_LIMITS.discoverPerMin + 1, '/api/discover');
  assert.equal(discover.at(-1), 429);
  assert.equal((await app.request('/api/search?q=a')).status, 200);
});

test('同一路由换 id 仍是同一个桶', async () => {
  const { app } = setup();
  for (let i = 0; i < API_RATE_LIMITS.lineReadPerMin; i++) {
    const id = (i % 2) + 1;
    assert.equal((await app.request(`/api/lines/${id}/play`)).status, 200);
  }
  assert.equal((await app.request('/api/lines/99/play')).status, 429);
  // context 是另一条路由，不受 play 的桶影响
  assert.equal((await app.request('/api/lines/99/context')).status, 200);
});

test('创建分享受限；GET 分享读取有独立桶', async () => {
  const { app } = setup();
  const posts = await statuses(app, API_RATE_LIMITS.createSharePerMin + 1, '/api/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"lineIds":[1]}',
  });
  assert.equal(posts.filter((s) => s === 201).length, API_RATE_LIMITS.createSharePerMin);
  assert.equal(posts.at(-1), 429);

  const reads = await statuses(app, API_RATE_LIMITS.readSharePerMin + 1, '/api/shares/abcd1234');
  assert.ok(reads.slice(0, API_RATE_LIMITS.readSharePerMin).every((s) => s === 200));
  assert.equal(reads.at(-1), 429);
});

test('分享内播放与主站 play 分桶', async () => {
  const { app } = setup();
  for (let i = 0; i < API_RATE_LIMITS.lineReadPerMin; i++) {
    assert.equal((await app.request('/api/shares/x/lines/1/play')).status, 200);
  }
  assert.equal((await app.request('/api/shares/x/lines/2/play')).status, 429);
  assert.equal((await app.request('/api/lines/2/play')).status, 200);
});

test('只信 X-Forwarded-For 的最后一跳；窗口过后恢复', async () => {
  const { app, advance } = setup();
  const post = (xff: string) =>
    app.request('/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
      body: '{}',
    });
  for (let i = 0; i < API_RATE_LIMITS.createSharePerMin; i++) {
    // 前面的伪造地址变来变去，最后一跳不变，应算同一个 IP
    assert.equal((await post(`1.1.1.${i}, 203.0.113.10`)).status, 201);
  }
  assert.equal((await post('9.9.9.9, 203.0.113.10')).status, 429);
  assert.equal((await post('203.0.113.10, 198.51.100.8')).status, 201);

  advance(API_RATE_LIMITS.windowMs);
  assert.equal((await post('203.0.113.10')).status, 201);
});

test('healthz 与季集列表不限流', async () => {
  const { app } = setup();
  for (const path of ['/healthz', '/api/episodes']) {
    const codes = await statuses(app, API_RATE_LIMITS.searchPerMin + 5, path);
    assert.ok(codes.every((s) => s === 200), path);
  }
});
