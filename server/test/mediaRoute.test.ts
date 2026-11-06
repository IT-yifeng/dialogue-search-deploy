// /media 路由测试：在临时目录放一个自编的小文件（不是真实视频），验证 Range 行为。
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { errorHandler, notFoundHandler } from '../src/lib/httpError.js';
import { createMediaRoutes } from '../src/routes/media.js';
import { LocalDriver } from '../src/storage/localDriver.js';

const CONTENT = '0123456789abcdefghij'; // 20 字节，便于肉眼核对区间
let scratch: string;
let app: Hono;

before(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'media-route-'));
  writeFileSync(path.join(scratch, 'S01E01.mp4'), CONTENT);
  writeFileSync(path.join(scratch, 'empty.mp4'), '');
  app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/media', createMediaRoutes(new LocalDriver(scratch)));
});

after(() => rmSync(scratch, { recursive: true, force: true }));

const get = (url: string, headers: Record<string, string> = {}, method = 'GET') =>
  app.request(url, { method, headers });

test('无 Range：200 返回全文，并声明支持 Range', async () => {
  const res = await get('/media/tbbt/S01E01.mp4');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.equal(res.headers.get('content-length'), '20');
  assert.equal(await res.text(), CONTENT);
});

test('Range：206 + Content-Range，只返回所请求的字节', async () => {
  const res = await get('/media/tbbt/S01E01.mp4', { Range: 'bytes=5-9' });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), 'bytes 5-9/20');
  assert.equal(res.headers.get('content-length'), '5');
  assert.equal(await res.text(), '56789');
});

test('Range：开放区间与尾段', async () => {
  const open = await get('/media/tbbt/S01E01.mp4', { Range: 'bytes=15-' });
  assert.equal(open.status, 206);
  assert.equal(await open.text(), 'fghij');
  const tail = await get('/media/tbbt/S01E01.mp4', { Range: 'bytes=-3' });
  assert.equal(tail.headers.get('content-range'), 'bytes 17-19/20');
  assert.equal(await tail.text(), 'hij');
});

test('Range 越界：416 并带 Content-Range: bytes */size', async () => {
  const res = await get('/media/tbbt/S01E01.mp4', { Range: 'bytes=20-' });
  assert.equal(res.status, 416);
  assert.equal(res.headers.get('content-range'), 'bytes */20');
});

test('HEAD：只有头，没有内容', async () => {
  const res = await get('/media/tbbt/S01E01.mp4', {}, 'HEAD');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-length'), '20');
  assert.equal(await res.text(), '');
});

test('空文件：200 空体，不报错', async () => {
  const res = await get('/media/tbbt/empty.mp4');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
});

test('不存在、路径穿越、非法编码：统一 404', async () => {
  const urls = [
    '/media/tbbt/nope.mp4',
    '/media/',
    '/media/tbbt/..%2Fsecret.mp4',
    '/media/%2e%2e/etc/passwd',
    '/media/tbbt/%E0%A4%A.mp4',
    '/media/tbbt/S01E01.mp4%5C..',
  ];
  for (const url of urls) {
    const res = await get(url);
    assert.equal(res.status, 404, url);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'NOT_FOUND', url);
  }
});
