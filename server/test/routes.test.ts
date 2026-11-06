// 路由层 + 业务层测试：用假的 repo 代替数据库，只验证参数校验、错误格式与参数传递。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { errorHandler, notFoundHandler } from '../src/lib/httpError.js';
import type { EpisodesRepo } from '../src/repos/episodesRepo.js';
import type { LineContext, LinesRepo, PlayInfo, SearchHit, SearchParams } from '../src/repos/linesRepo.js';
import { createEpisodesRoutes } from '../src/routes/episodes.js';
import { createLinesRoutes } from '../src/routes/lines.js';
import { createSearchRoutes } from '../src/routes/search.js';
import { createPlayService } from '../src/services/playService.js';
import { createSearchService } from '../src/services/searchService.js';
import type { StorageDriver } from '../src/storage/types.js';

interface Spy {
  searchCalls: SearchParams[];
  contextCalls: Array<[number, number, number]>;
  playCalls: number[];
}

function setup(opts: {
  context?: LineContext | null;
  throwOnSearch?: Error;
  play?: PlayInfo | null;
  /** 第二次 search 调用的返回值（用于多词 AND=0 → OR 放宽） */
  secondSearch?: { total: number; items: SearchHit[] };
} = {}) {
  const spy: Spy = { searchCalls: [], contextCalls: [], playCalls: [] };
  let searchIdx = 0;
  const lines: LinesRepo = {
    async search(p) {
      if (opts.throwOnSearch) throw opts.throwOnSearch;
      spy.searchCalls.push(p);
      searchIdx += 1;
      if (searchIdx === 2 && opts.secondSearch) return opts.secondSearch;
      return { total: 0, items: [] };
    },
    async findContext(id, before, after) {
      spy.contextCalls.push([id, before, after]);
      return opts.context === undefined ? null : opts.context;
    },
    async findPlayInfo(id) {
      spy.playCalls.push(id);
      return opts.play === undefined ? null : opts.play;
    },
    async findByIds() {
      return [];
    },
    async sampleWithVideo() {
      return [];
    },
  };
  // 假存储：任何 key 都“存在”，URL 形如 /media/<key>，足够验证路由到 service 的串联
  const storage: StorageDriver = {
    async put() {},
    async exists() {
      return true;
    },
    async getPlayUrl(key) {
      return `/media/${key}`;
    },
  };
  const episodes: EpisodesRepo = {
    async listAll() {
      return [{ season: 1, episode: 1, titleEn: 'A', titleZh: '甲', hasVideo: true }];
    },
  };
  const service = createSearchService(lines, episodes);
  // 与 index.ts 保持同样的挂载方式与错误处理
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/api/search', createSearchRoutes(service));
  app.route('/api/lines', createLinesRoutes(service, createPlayService(lines, storage)));
  app.route('/api/episodes', createEpisodesRoutes(service));
  return { app, spy };
}

async function expectError(res: Response, status: number, code: string) {
  assert.equal(res.status, status);
  const body = (await res.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
}

test('search：默认分页参数，返回契约结构', async () => {
  const { app, spy } = setup();
  const res = await app.request('/api/search?q=penny');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { total: 0, page: 1, pageSize: 20, relaxed: false, items: [] });
  assert.deepEqual(spy.searchCalls[0], {
    terms: ['penny'],
    season: undefined,
    limit: 20,
    offset: 0,
    mode: 'and',
    exact: false,
  });
});

test('search：page / pageSize / season 换算为 limit / offset', async () => {
  const { app, spy } = setup();
  await app.request('/api/search?q=a&season=2&page=3&pageSize=10');
  assert.deepEqual(spy.searchCalls[0], {
    terms: ['a'],
    season: 2,
    limit: 10,
    offset: 20,
    mode: 'and',
    exact: false,
  });
});

test('search：URL 编码的 % 与中文原样传给 repo', async () => {
  const { app, spy } = setup();
  await app.request('/api/search?q=%25');
  await app.request(`/api/search?q=${encodeURIComponent('佩妮 penny')}`);
  assert.deepEqual(spy.searchCalls[0]?.terms, ['%']);
  assert.deepEqual(spy.searchCalls[1]?.terms, ['佩妮', 'penny']);
  assert.equal(spy.searchCalls[1]?.mode, 'and');
});

test('search：exact=1 不切词', async () => {
  const { app, spy } = setup();
  await app.request('/api/search?q=a%20b+c&exact=1');
  assert.deepEqual(spy.searchCalls[0], {
    terms: ['a b c'],
    season: undefined,
    limit: 20,
    offset: 0,
    mode: 'and',
    exact: true,
  });
});

test('search：多词 AND 无结果时放宽为 OR 并 relaxed', async () => {
  const hit: SearchHit = {
    id: 1,
    episode: { season: 1, episode: 1, titleEn: 'A', titleZh: '甲' },
    startMs: 0,
    endMs: 100,
    en: 'x',
    zh: 'y',
    hasVideo: true,
  };
  const { app, spy } = setup({ secondSearch: { total: 1, items: [hit] } });
  const res = await app.request('/api/search?q=a+b');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { total: 1, page: 1, pageSize: 20, relaxed: true, items: [hit] });
  assert.equal(spy.searchCalls.length, 2);
  assert.equal(spy.searchCalls[0]?.mode, 'and');
  assert.equal(spy.searchCalls[1]?.mode, 'or');
});

test('search：多词 AND 有结果时不调 OR', async () => {
  const hit: SearchHit = {
    id: 1,
    episode: { season: 1, episode: 1, titleEn: 'A', titleZh: '甲' },
    startMs: 0,
    endMs: 100,
    en: 'x',
    zh: 'y',
    hasVideo: true,
  };
  const lines: LinesRepo = {
    async search(p) {
      if (p.mode === 'and') return { total: 1, items: [hit] };
      return { total: 99, items: [] };
    },
    async findContext() {
      return null;
    },
    async findPlayInfo() {
      return null;
    },
    async findByIds() {
      return [];
    },
    async sampleWithVideo() {
      return [];
    },
  };
  const storage: StorageDriver = {
    async put() {},
    async exists() {
      return true;
    },
    async getPlayUrl(key) {
      return `/media/${key}`;
    },
  };
  const episodes: EpisodesRepo = {
    async listAll() {
      return [{ season: 1, episode: 1, titleEn: 'A', titleZh: '甲', hasVideo: true }];
    },
  };
  const service = createSearchService(lines, episodes);
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/api/search', createSearchRoutes(service));
  app.route('/api/lines', createLinesRoutes(service, createPlayService(lines, storage)));
  const res = await app.request('/api/search?q=a+b');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { total: 1, page: 1, pageSize: 20, relaxed: false, items: [hit] });
});

test('search：非法参数返回 400 且不查库', async () => {
  const { app, spy } = setup();
  const bad = [
    '/api/search',
    '/api/search?q=',
    '/api/search?q=%20%20',
    `/api/search?q=${'a'.repeat(51)}`,
    '/api/search?q=a&page=0',
    '/api/search?q=a&page=-1',
    '/api/search?q=a&page=1.5',
    '/api/search?q=a&pageSize=51',
    '/api/search?q=a&pageSize=0',
    '/api/search?q=a&season=abc',
    '/api/search?q=a&season=0',
    '/api/search?q=a&page=1e3',
  ];
  for (const url of bad) {
    await expectError(await app.request(url), 400, 'BAD_REQUEST');
  }
  assert.equal(spy.searchCalls.length, 0);
});

test('search：repo 抛出的非预期错误只返回 INTERNAL，不泄漏细节', async () => {
  const originalError = console.error;
  console.error = () => {}; // 错误处理会打日志，测试里静音
  try {
    const { app } = setup({ throwOnSearch: new Error('password authentication failed for user x') });
    const res = await app.request('/api/search?q=a');
    await expectError(res.clone(), 500, 'INTERNAL');
    assert.doesNotMatch(await res.text(), /password/);
  } finally {
    console.error = originalError;
  }
});

test('context：默认前后各 2 句，返回契约结构', async () => {
  const ctx: LineContext = {
    episode: { season: 2, episode: 5, titleEn: null, titleZh: null },
    lines: [{ id: 7, idx: 1, startMs: 0, endMs: 10, en: 'x', zh: '甲' }],
  };
  const { app, spy } = setup({ context: ctx });
  const res = await app.request('/api/lines/7/context');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { episode: ctx.episode, currentId: 7, lines: ctx.lines });
  assert.deepEqual(spy.contextCalls[0], [7, 2, 2]);
});

test('context：before / after 可为 0 和 5，传递给 repo', async () => {
  const { app, spy } = setup({ context: { episode: { season: 1, episode: 1, titleEn: null, titleZh: null }, lines: [] } });
  await app.request('/api/lines/9/context?before=0&after=5');
  assert.deepEqual(spy.contextCalls[0], [9, 0, 5]);
});

test('context：台词不存在返回 404', async () => {
  const { app } = setup({ context: null });
  await expectError(await app.request('/api/lines/999/context'), 404, 'NOT_FOUND');
});

test('line：GET /api/lines/:id 返回单条，与 search items 同形', async () => {
  const hit: SearchHit = {
    id: 42,
    episode: { season: 1, episode: 2, titleEn: 'T', titleZh: '标题' },
    startMs: 1000,
    endMs: 2000,
    en: 'hello',
    zh: '你好',
    hasVideo: true,
  };
  const lines: LinesRepo = {
    async search() {
      return { total: 0, items: [] };
    },
    async findContext() {
      return null;
    },
    async findPlayInfo() {
      return null;
    },
    async findByIds(ids) {
      assert.deepEqual(ids, [42]);
      return [hit];
    },
    async sampleWithVideo() {
      return [];
    },
  };
  const storage: StorageDriver = {
    async put() {},
    async exists() {
      return true;
    },
    async getPlayUrl(key) {
      return `/media/${key}`;
    },
  };
  const episodes: EpisodesRepo = {
    async listAll() {
      return [];
    },
  };
  const service = createSearchService(lines, episodes);
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/api/lines', createLinesRoutes(service, createPlayService(lines, storage)));
  const res = await app.request('/api/lines/42');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), hit);
});

test('line：不存在返回 404', async () => {
  const { app } = setup();
  await expectError(await app.request('/api/lines/1'), 404, 'NOT_FOUND');
});

test('context：非法参数返回 400 且不查库', async () => {
  const { app, spy } = setup({ context: null });
  const bad = [
    '/api/lines/abc/context',
    '/api/lines/0/context',
    '/api/lines/-1/context',
    '/api/lines/1.5/context',
    '/api/lines/99999999999999999999/context',
    '/api/lines/1/context?before=6',
    '/api/lines/1/context?after=6',
    '/api/lines/1/context?before=-1',
    '/api/lines/1/context?after=x',
  ];
  for (const url of bad) {
    await expectError(await app.request(url), 400, 'BAD_REQUEST');
  }
  assert.equal(spy.contextCalls.length, 0);
});

test('play：返回契约结构，且禁止缓存', async () => {
  const { app, spy } = setup({ play: { startMs: 123400, endMs: 125900, videoKey: 'tbbt/S01E01.mp4' } });
  const res = await app.request('/api/lines/12345/play');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = (await res.json()) as { url: string; startMs: number; endMs: number; expiresAt: number };
  assert.equal(body.url, '/media/tbbt/S01E01.mp4');
  assert.equal(body.startMs, 123400);
  assert.equal(body.endMs, 125900);
  assert.equal(typeof body.expiresAt, 'number');
  assert.deepEqual(spy.playCalls, [12345]);
});

test('play：台词不存在 404 NOT_FOUND；该集无视频 404 NO_VIDEO', async () => {
  await expectError(await setup({ play: null }).app.request('/api/lines/1/play'), 404, 'NOT_FOUND');
  const noVideo = setup({ play: { startMs: 0, endMs: 10, videoKey: null } });
  await expectError(await noVideo.app.request('/api/lines/1/play'), 404, 'NO_VIDEO');
});

test('play：非法 id 返回 400 且不查库', async () => {
  const { app, spy } = setup({ play: null });
  for (const id of ['abc', '0', '-1', '1.5', '99999999999999999999']) {
    await expectError(await app.request(`/api/lines/${id}/play`), 400, 'BAD_REQUEST');
  }
  assert.equal(spy.playCalls.length, 0);
});

test('episodes：返回 items 并带私有缓存头', async () => {
  const { app } = setup();
  const res = await app.request('/api/episodes');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, max-age=300');
  assert.deepEqual(await res.json(), {
    items: [{ season: 1, episode: 1, titleEn: 'A', titleZh: '甲', hasVideo: true }],
  });
});

test('未知路由使用统一错误格式', async () => {
  const { app } = setup();
  await expectError(await app.request('/api/nope'), 404, 'NOT_FOUND');
});
