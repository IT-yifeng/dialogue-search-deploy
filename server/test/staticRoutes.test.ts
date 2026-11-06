// 静态托管测试：用临时目录当作前端构建产物。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { errorHandler, notFoundHandler } from '../src/lib/httpError.js';
import { noindex } from '../src/middleware/noindex.js';
import { createStaticRoutes } from '../src/routes/static.js';

let base: string;
let publicDir: string;
let app: Hono;

before(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'static-test-'));
  publicDir = path.join(base, 'public');
  await mkdir(path.join(publicDir, 'assets'), { recursive: true });
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>spa-shell</title>');
  await writeFile(path.join(publicDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  await writeFile(path.join(publicDir, 'assets', 'index-abc123.js'), 'console.log(1)');
  // 放在 public 之外的“机密”文件：任何路径花样都不能把它读出来
  await writeFile(path.join(base, 'secret.txt'), 'TOP-SECRET');

  app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.use('*', noindex);
  app.get('/api/ping', (c) => c.json({ pong: true }));
  const routes = createStaticRoutes(publicDir);
  assert.ok(routes);
  app.route('/', routes);
});

after(async () => {
  await rm(base, { recursive: true, force: true });
});

test('目录没有 index.html 时不挂载（本地开发场景）', () => {
  assert.equal(createStaticRoutes(path.join(base, 'not-exist')), null);
});

test('首页：返回 index.html 且不缓存', async () => {
  const res = await app.request('/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /spa-shell/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
});

test('带哈希的资源：长期缓存，MIME 正确', async () => {
  const res = await app.request('/assets/index-abc123.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /javascript/);
  assert.match(res.headers.get('cache-control') ?? '', /immutable/);
});

test('robots.txt：直接提供，内容为全部禁止', async () => {
  const res = await app.request('/robots.txt');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Disallow: \//);
});

test('前端路由：/s/:id 与 /gate 刷新时回退到 index.html', async () => {
  for (const p of ['/s/aB3dE9xZ', '/gate', '/some/deep/route']) {
    const res = await app.request(p);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), /spa-shell/, p);
  }
});

test('后端路径：未知的 /api 与 /media 返回 JSON 404，不能被前端页面吞掉', async () => {
  for (const p of ['/api/unknown', '/media/tbbt/x.mp4']) {
    const res = await app.request(p);
    assert.equal(res.status, 404, p);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'NOT_FOUND');
  }
  assert.equal((await app.request('/api/ping')).status, 200);
});

test('缺失的资源文件返回 404，而不是 index.html', async () => {
  const res = await app.request('/assets/index-old999.js');
  assert.equal(res.status, 404);
});

test('非 GET 请求不回退到页面', async () => {
  assert.equal((await app.request('/s/abc', { method: 'POST' })).status, 404);
});

test('路径穿越：读不到 public 之外的文件', async () => {
  for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/..%2Fsecret.txt']) {
    const res = await app.request(p);
    assert.doesNotMatch(await res.text(), /TOP-SECRET/, p);
  }
});

test('所有响应都带 X-Robots-Tag: noindex', async () => {
  for (const p of ['/', '/api/ping', '/api/unknown', '/assets/index-abc123.js']) {
    assert.match((await app.request(p)).headers.get('x-robots-tag') ?? '', /noindex/, p);
  }
});
