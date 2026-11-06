// shares 路由测试：假 service 只记录调用，验证请求体 / 参数校验与状态码。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { errorHandler, notFound, notFoundHandler } from '../src/lib/httpError.js';
import { createSharesRoutes } from '../src/routes/shares.js';
import type { CreateShareInput, ShareService } from '../src/services/shareService.js';

function setup() {
  const calls = { create: [] as CreateShareInput[], get: [] as string[], play: [] as Array<[string, number]> };
  const service: ShareService = {
    async create(input) {
      calls.create.push(input);
      return { id: 'abcd1234', url: 'https://example.com/s/abcd1234' };
    },
    async get(id) {
      calls.get.push(id);
      if (id === 'gone0000') throw notFound('分享不存在或已失效');
      return { id, note: null, createdAt: '2026-01-01T00:00:00.000Z', items: [] };
    },
    async getPlay(id, lineId) {
      calls.play.push([id, lineId]);
      return { url: 'signed://x', startMs: 0, endMs: 1, expiresAt: 1 };
    },
  };
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/api/shares', createSharesRoutes(service));
  return { app, calls };
}

const post = (app: Hono, body: unknown, raw = false) =>
  app.request('/api/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });

test('POST：合法请求返回 201 与 {id, url}', async () => {
  const { app, calls } = setup();
  const res = await post(app, { lineIds: [1, 2], note: '好' });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { id: 'abcd1234', url: 'https://example.com/s/abcd1234' });
  assert.deepEqual(calls.create, [{ lineIds: [1, 2], note: '好' }]);
});

test('POST：note 可省略或为 null', async () => {
  const { app } = setup();
  assert.equal((await post(app, { lineIds: [1] })).status, 201);
  assert.equal((await post(app, { lineIds: [1], note: null })).status, 201);
});

test('POST：请求体不合法一律 400 BAD_REQUEST，且不进入 service', async () => {
  const { app, calls } = setup();
  const bad: unknown[] = [
    { lineIds: 'abc' },
    {},
    { lineIds: ['1'] },
    { lineIds: [1.5] },
    { lineIds: [0] },
    { lineIds: [-1] },
    { lineIds: [Number.MAX_SAFE_INTEGER + 2] },
    { lineIds: [1], note: 123 },
    [1, 2],
    null,
  ];
  for (const body of bad) {
    const res = await post(app, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'BAD_REQUEST');
  }
  const notJson = await post(app, '{not json', true);
  assert.equal(notJson.status, 400);
  assert.equal(calls.create.length, 0);
});

test('GET /:id：返回内容并禁止缓存；ID 形态不对按 404 处理且不查库', async () => {
  const { app, calls } = setup();
  const ok = await app.request('/api/shares/abcd1234');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');

  assert.equal((await app.request('/api/shares/short')).status, 404);
  assert.equal((await app.request('/api/shares/gone0000')).status, 404);
  assert.deepEqual(calls.get, ['abcd1234', 'gone0000']);
});

test('GET /:id/lines/:lineId/play：参数解析、禁止缓存、lineId 非法返回 400', async () => {
  const { app, calls } = setup();
  const ok = await app.request('/api/shares/abcd1234/lines/42/play');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls.play, [['abcd1234', 42]]);

  assert.equal((await app.request('/api/shares/abcd1234/lines/abc/play')).status, 400);
  assert.equal((await app.request('/api/shares/abcd1234/lines/0/play')).status, 400);
  assert.equal((await app.request('/api/shares/short/lines/1/play')).status, 404);
});
