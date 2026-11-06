// playService 单测：用假 repo 与假存储，验证“能不能播”的判断与返回结构。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LinesRepo, PlayInfo } from '../src/repos/linesRepo.js';
import { createPlayService, PLAY_URL_TTL_SEC } from '../src/services/playService.js';
import type { StorageDriver } from '../src/storage/types.js';

function setup(info: PlayInfo | null, fileExists = true) {
  const calls = { exists: [] as string[], playUrl: [] as Array<[string, number]> };
  const lines = { findPlayInfo: async () => info } as unknown as LinesRepo;
  const storage: StorageDriver = {
    async put() {},
    async exists(key) {
      calls.exists.push(key);
      return fileExists;
    },
    async getPlayUrl(key, ttl) {
      calls.playUrl.push([key, ttl]);
      return `signed://${key}`;
    },
  };
  // 固定时钟：1_700_000_000_500 ms，取整后是 1_700_000_000 秒
  const service = createPlayService(lines, storage, () => 1_700_000_000_500);
  return { service, calls };
}

test('正常：返回 url、台词原始起止、秒级过期时间，且 ttl 为 1 小时', async () => {
  const { service, calls } = setup({ startMs: 123400, endMs: 125900, videoKey: 'tbbt/S01E01.mp4' });
  assert.deepEqual(await service.getPlay(1), {
    url: 'signed://tbbt/S01E01.mp4',
    startMs: 123400,
    endMs: 125900,
    expiresAt: 1_700_000_000 + 3600,
  });
  assert.deepEqual(calls.playUrl, [['tbbt/S01E01.mp4', PLAY_URL_TTL_SEC]]);
});

test('台词不存在：404 NOT_FOUND', async () => {
  await assert.rejects(setup(null).service.getPlay(1), { status: 404, code: 'NOT_FOUND' });
});

test('video_key 为空：404 NO_VIDEO，且不访问存储', async () => {
  const { service, calls } = setup({ startMs: 0, endMs: 10, videoKey: null });
  await assert.rejects(service.getPlay(1), { status: 404, code: 'NO_VIDEO' });
  assert.equal(calls.exists.length, 0);
});

test('存储里找不到文件：404 NO_VIDEO，且不签发 URL', async () => {
  const { service, calls } = setup({ startMs: 0, endMs: 10, videoKey: 'tbbt/S01E01.mp4' }, false);
  await assert.rejects(service.getPlay(1), { status: 404, code: 'NO_VIDEO' });
  assert.equal(calls.playUrl.length, 0);
});
