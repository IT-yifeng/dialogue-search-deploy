// shareService 单测：用假 repo，验证数量 / 留言规则、顺序还原、冲突重试与越权。
// 台词均为自编的虚构句子。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LinesRepo, SearchHit } from '../src/repos/linesRepo.js';
import type { ShareRecord, SharesRepo } from '../src/repos/sharesRepo.js';
import type { PlayService } from '../src/services/playService.js';
import { createShareService, SHARE_MAX_LINES, SHARE_NOTE_MAX } from '../src/services/shareService.js';

const hit = (id: number): SearchHit => ({
  id,
  episode: { season: 1, episode: 1, titleEn: null, titleZh: null },
  startMs: id * 1000,
  endMs: id * 1000 + 500,
  en: `line ${id}`,
  zh: `第 ${id} 句`,
  hasVideo: true,
});

interface Opts {
  /** 库里存在的台词 id；默认 1～100 */
  existing?: number[];
  /** 预先占用的短 ID，用来制造冲突 */
  takenIds?: string[];
  genIds?: string[];
}

function setup(opts: Opts = {}) {
  const existing = new Set(opts.existing ?? Array.from({ length: 100 }, (_, i) => i + 1));
  const store = new Map<string, ShareRecord>();
  for (const id of opts.takenIds ?? []) {
    store.set(id, { id, lineIds: [1], note: null, createdAt: new Date(0) });
  }
  const views: string[] = [];
  const playCalls: number[] = [];

  const lines = {
    // 故意倒序返回：验证 service 不依赖 repo 的顺序
    async findByIds(ids: number[]) {
      return ids.filter((i) => existing.has(i)).map(hit).reverse();
    },
  } as unknown as LinesRepo;

  const shares: SharesRepo = {
    async insert(p) {
      if (store.has(p.id)) return false;
      store.set(p.id, { id: p.id, lineIds: p.lineIds, note: p.note, createdAt: new Date('2026-01-02T03:04:05Z') });
      return true;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async incrementView(id) {
      views.push(id);
    },
  };

  const play = {
    async getPlay(lineId: number) {
      playCalls.push(lineId);
      return { url: `signed://${lineId}`, startMs: 0, endMs: 1, expiresAt: 1 };
    },
  } as unknown as PlayService;

  const queue = [...(opts.genIds ?? ['AAAAAAAA'])];
  const service = createShareService({
    shares,
    lines,
    play,
    publicBaseUrl: 'https://example.com/',
    genId: () => queue.shift() ?? 'ZZZZZZZZ',
  });
  return { service, store, views, playCalls };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('创建：返回 id 与由 PUBLIC_BASE_URL 拼成的链接（去掉末尾斜杠）', async () => {
  const { service, store } = setup({ genIds: ['abcd1234'] });
  const r = await service.create({ lineIds: [3, 1, 2], note: '  留言  ' });
  assert.deepEqual(r, { id: 'abcd1234', url: 'https://example.com/s/abcd1234' });
  // 保持勾选顺序、留言去首尾空白
  assert.deepEqual(store.get('abcd1234')?.lineIds, [3, 1, 2]);
  assert.equal(store.get('abcd1234')?.note, '留言');
});

test('数量：0 条与 21 条被拒，1 条与 20 条通过', async () => {
  const { service } = setup();
  await assert.rejects(service.create({ lineIds: [] }), { status: 400, code: 'BAD_REQUEST' });
  await assert.rejects(service.create({ lineIds: range(SHARE_MAX_LINES + 1) }), { status: 400 });
  await service.create({ lineIds: [1] });
  await service.create({ lineIds: range(SHARE_MAX_LINES) });
});

test('去重：重复 id 只保留首次出现的位置；去重后的数量才参与上限判断', async () => {
  const { service, store } = setup({ genIds: ['id000001', 'id000002'] });
  await service.create({ lineIds: [5, 2, 5, 9, 2] });
  assert.deepEqual(store.get('id000001')?.lineIds, [5, 2, 9]);
  // 25 个输入、但只有 20 个不同 id：允许
  await service.create({ lineIds: [...range(20), ...range(5)] });
});

test('留言：100 字通过、101 字被拒；空白按无留言；emoji 按 1 个字符算', async () => {
  const { service, store } = setup({ genIds: ['id000001', 'id000002', 'id000003'] });
  await service.create({ lineIds: [1], note: 'a'.repeat(SHARE_NOTE_MAX) });
  await assert.rejects(service.create({ lineIds: [1], note: 'a'.repeat(SHARE_NOTE_MAX + 1) }), { status: 400 });
  await service.create({ lineIds: [1], note: '   ' });
  assert.equal(store.get('id000002')?.note, null);
  await service.create({ lineIds: [1], note: '😀'.repeat(SHARE_NOTE_MAX) });
});

test('台词不存在：整体 400，且不写入', async () => {
  const { service, store } = setup({ existing: [1, 2] });
  await assert.rejects(service.create({ lineIds: [1, 2, 3] }), { status: 400, code: 'BAD_REQUEST' });
  assert.equal(store.size, 0);
});

test('短 ID 冲突：换一个重试；连续冲突才报错', async () => {
  const ok = setup({ takenIds: ['AAAAAAAA', 'BBBBBBBB'], genIds: ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC'] });
  assert.equal((await ok.service.create({ lineIds: [1] })).id, 'CCCCCCCC');

  const taken = ['A', 'B', 'C', 'D', 'E'].map((c) => c.repeat(8));
  const bad = setup({ takenIds: taken, genIds: taken });
  await assert.rejects(bad.service.create({ lineIds: [1] }), /冲突/);
});

test('读取：按勾选顺序还原，并给浏览量 +1', async () => {
  const { service, views } = setup({ genIds: ['abcd1234'] });
  await service.create({ lineIds: [7, 3, 5], note: '你好' });
  const view = await service.get('abcd1234');
  assert.deepEqual(view.items.map((i) => i.id), [7, 3, 5]);
  assert.equal(view.note, '你好');
  assert.equal(view.createdAt, '2026-01-02T03:04:05.000Z');
  assert.deepEqual(views, ['abcd1234']);
});

test('读取：已不存在的台词被略过；全部不存在时 404 且不计数', async () => {
  const live = setup({ genIds: ['abcd1234'] });
  await live.service.create({ lineIds: [1, 2, 3] });
  // 模拟语料重灌后第 2 条消失：直接改 repo 的“库存”不方便，所以用另一个 service 读同一个 store
  const lines = { findByIds: async (ids: number[]) => ids.filter((i) => i !== 2).map(hit) } as unknown as LinesRepo;
  const reader = createShareService({
    shares: {
      insert: async () => true,
      findById: async (id) => live.store.get(id) ?? null,
      incrementView: async (id) => void live.views.push(id),
    },
    lines,
    play: {} as PlayService,
    publicBaseUrl: 'https://x.test',
  });
  assert.deepEqual((await reader.get('abcd1234')).items.map((i) => i.id), [1, 3]);

  const gone = createShareService({
    shares: { insert: async () => true, findById: async (id) => live.store.get(id) ?? null, incrementView: async () => {} },
    lines: { findByIds: async () => [] } as unknown as LinesRepo,
    play: {} as PlayService,
    publicBaseUrl: 'https://x.test',
  });
  await assert.rejects(gone.get('abcd1234'), { status: 404, code: 'NOT_FOUND' });
  assert.equal(live.views.length, 1, '只有第一次成功读取计数');
});

test('读取：分享不存在返回 404', async () => {
  await assert.rejects(setup().service.get('nope0000'), { status: 404, code: 'NOT_FOUND' });
});

test('播放：只签发属于该分享的台词；越权与分享不存在都是 404', async () => {
  const { service, playCalls, views } = setup({ genIds: ['abcd1234'] });
  await service.create({ lineIds: [4, 8] });
  assert.equal((await service.getPlay('abcd1234', 8)).url, 'signed://8');
  await assert.rejects(service.getPlay('abcd1234', 9), { status: 404, code: 'NOT_FOUND' });
  await assert.rejects(service.getPlay('nope0000', 8), { status: 404 });
  assert.deepEqual(playCalls, [8], '越权请求不能走到签发');
  assert.equal(views.length, 0, '播放不计浏览量');
});
