// r2Driver 测试：不联网。预签名是纯本地计算；exists 用替换掉 send 的客户端模拟 R2 的各种响应。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Driver } from '../src/storage/r2Driver.js';

const CFG = { accountId: 'acc123', accessKeyId: 'AKIAFAKE', secretAccessKey: 'fakesecret', bucket: 'tbbt-media' };

test('getPlayUrl：预签名 GET 链接指向 R2 私有桶，带过期时间与签名，不含密钥', async () => {
  const url = new URL(await new R2Driver(CFG).getPlayUrl('tbbt/S01E01.mp4', 3600));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'tbbt-media.acc123.r2.cloudflarestorage.com');
  assert.equal(url.pathname, '/tbbt/S01E01.mp4');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '3600');
  assert.ok(url.searchParams.get('X-Amz-Signature'));
  assert.match(url.searchParams.get('X-Amz-Credential') ?? '', /^AKIAFAKE\//);
  assert.ok(!url.href.includes('fakesecret'));
  // 没有多余的校验参数，R2 才不会拒绝
  assert.equal(url.searchParams.get('x-amz-checksum-mode'), null);
});

test('getPlayUrl：有效期取调用方传入的 ttl', async () => {
  const url = new URL(await new R2Driver(CFG).getPlayUrl('a/b.mp4', 60));
  assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
});

function driverWithSend(send: () => Promise<unknown>): R2Driver {
  const client = new S3Client({ region: 'auto', endpoint: 'https://x.invalid', credentials: { accessKeyId: 'a', secretAccessKey: 'b' } });
  (client as unknown as { send: typeof send }).send = send;
  return new R2Driver(CFG, client);
}

test('exists：对象存在返回 true', async () => {
  assert.equal(await driverWithSend(async () => ({})).exists('tbbt/S01E01.mp4'), true);
});

test('exists：404 / NotFound 返回 false', async () => {
  const notFound = Object.assign(new Error('nf'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
  assert.equal(await driverWithSend(async () => Promise.reject(notFound)).exists('k'), false);
  const bare404 = Object.assign(new Error('x'), { name: 'UnknownError', $metadata: { httpStatusCode: 404 } });
  assert.equal(await driverWithSend(async () => Promise.reject(bare404)).exists('k'), false);
});

test('exists：凭据错误、服务故障等不能被当成“不存在”', async () => {
  for (const [name, status] of [['AccessDenied', 403], ['InternalError', 500]] as const) {
    const err = Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
    await assert.rejects(driverWithSend(async () => Promise.reject(err)).exists('k'), { name });
  }
});
