// 上传编排测试：用内存里的假存储，不联网。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readR2Config } from '../src/r2Store.js';
import { uploadAll, type ObjectStore, type UploadItem } from '../src/upload.js';

function fakeStore(initial: Record<string, number> = {}, failOn: string[] = []) {
  const remote = new Map(Object.entries(initial));
  const puts: string[] = [];
  const store: ObjectStore = {
    async head(key) {
      const size = remote.get(key);
      return size === undefined ? null : { size };
    },
    async put(key, _path, size, contentType) {
      assert.equal(contentType, 'video/mp4');
      if (failOn.includes(key)) throw new Error('网络中断');
      puts.push(key);
      remote.set(key, size);
    },
  };
  return { store, puts, remote };
}

const item = (id: string, size: number): UploadItem => ({ key: `tbbt/${id}.mp4`, localPath: `/work/mp4/${id}.mp4`, size });

test('不存在的上传，已存在且大小一致的跳过', async () => {
  const { store, puts } = fakeStore({ 'tbbt/S01E01.mp4': 100 });
  const res = await uploadAll(store, [item('S01E01', 100), item('S01E02', 200)]);
  assert.deepEqual(res.map((r) => r.status), ['skipped', 'uploaded']);
  assert.deepEqual(puts, ['tbbt/S01E02.mp4']);
});

test('存在但大小不同（重新转码过）：覆盖上传', async () => {
  const { store, puts, remote } = fakeStore({ 'tbbt/S01E01.mp4': 100 });
  const res = await uploadAll(store, [item('S01E01', 150)]);
  assert.equal(res[0]?.status, 'uploaded');
  assert.deepEqual(puts, ['tbbt/S01E01.mp4']);
  assert.equal(remote.get('tbbt/S01E01.mp4'), 150);
});

test('--force：即使一致也重新上传', async () => {
  const { store, puts } = fakeStore({ 'tbbt/S01E01.mp4': 100 });
  const res = await uploadAll(store, [item('S01E01', 100)], { force: true });
  assert.equal(res[0]?.status, 'uploaded');
  assert.equal(puts.length, 1);
});

test('单个失败不中断整批，且汇总原因；重跑时只补失败的', async () => {
  const first = fakeStore({}, ['tbbt/S01E02.mp4']);
  const items = [item('S01E01', 1), item('S01E02', 2), item('S01E03', 3)];
  const res = await uploadAll(first.store, items);
  assert.deepEqual(res.map((r) => r.status), ['uploaded', 'failed', 'uploaded']);
  assert.match(res[1]?.error ?? '', /网络中断/);

  // 第二次：同一份“云端”，不再失败
  const second = fakeStore(Object.fromEntries(first.remote));
  const again = await uploadAll(second.store, items);
  assert.deepEqual(again.map((r) => r.status), ['skipped', 'uploaded', 'skipped']);
});

test('head 出错（如凭据无效）按失败处理，绝不当作“不存在”去上传', async () => {
  const store: ObjectStore = {
    async head() {
      throw new Error('AccessDenied');
    },
    async put() {
      assert.fail('不应该走到上传');
    },
  };
  const res = await uploadAll(store, [item('S01E01', 1)]);
  assert.equal(res[0]?.status, 'failed');
});

test('进度回调：每个文件一次，带序号与总数', async () => {
  const { store } = fakeStore();
  const seen: Array<[string, number, number]> = [];
  await uploadAll(store, [item('S01E01', 1), item('S01E02', 2)], { onProgress: (r, i, n) => seen.push([r.key, i, n]) });
  assert.deepEqual(seen, [['tbbt/S01E01.mp4', 0, 2], ['tbbt/S01E02.mp4', 1, 2]]);
});

test('readR2Config：齐全时读出，缺失时指出变量名', () => {
  const env = { R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'd' };
  assert.deepEqual(readR2Config(env), { accountId: 'a', accessKeyId: 'b', secretAccessKey: 'c', bucket: 'd' });
  assert.throws(() => readR2Config({ ...env, R2_BUCKET: '' }), /R2_BUCKET/);
  assert.throws(() => readR2Config({}), /R2_ACCOUNT_ID/);
});
