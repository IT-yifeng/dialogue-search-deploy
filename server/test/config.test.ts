// 配置校验测试：存储相关变量填错时，必须在启动阶段就失败，而不是上线后才暴露。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { loadConfig as LoadConfig } from '../src/config.js';

let loadConfig: typeof LoadConfig;

before(async () => {
  // config.ts 在被导入时就会读取 process.env 并创建全局 config，所以先塞一个假的连接串再动态导入
  process.env.DATABASE_URL ??= 'postgres://u:p@localhost:5432/test';
  ({ loadConfig } = await import('../src/config.js'));
});

const R2_ENV = {
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
};
const prodEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@h/db',
  PUBLIC_BASE_URL: 'https://example.com',
  ...R2_ENV,
  ...extra,
});

test('开发环境：默认 local 驱动，r2 为 null', () => {
  const c = loadConfig({ DATABASE_URL: 'postgres://u:p@h/db' });
  assert.equal(c.storageDriver, 'local');
  assert.equal(c.r2, null);
});

test('生产环境：合法配置通过，并读出 R2 凭据', () => {
  const c = loadConfig(prodEnv());
  assert.equal(c.storageDriver, 'r2');
  assert.deepEqual(c.r2, { accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'bucket' });
});

test('生产环境：拒绝 STORAGE_DRIVER=local', () => {
  assert.throws(() => loadConfig(prodEnv({ STORAGE_DRIVER: 'local' })), /不能使用 STORAGE_DRIVER=local/);
  // 缺省值也是 local，同样要拒绝
  assert.throws(() => loadConfig(prodEnv({ STORAGE_DRIVER: undefined })), /不能使用 STORAGE_DRIVER=local/);
});

test('r2 驱动：缺任意一个 R2_* 变量都失败，并指出是哪一个', () => {
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
    assert.throws(() => loadConfig(prodEnv({ [name]: ' ' })), new RegExp(name));
  }
});

test('STORAGE_DRIVER 取值非法时失败', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', STORAGE_DRIVER: 's3' }), /STORAGE_DRIVER/);
});
