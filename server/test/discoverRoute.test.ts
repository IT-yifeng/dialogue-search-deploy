// GET /api/discover：假 repo 验证条数上限、返回形状，以及没有查询参数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { errorHandler, notFoundHandler } from '../src/lib/httpError.js';
import type { LinesRepo, SearchHit } from '../src/repos/linesRepo.js';
import type { EpisodesRepo } from '../src/repos/episodesRepo.js';
import { createDiscoverRoutes } from '../src/routes/discover.js';
import { createSearchService, DISCOVER_LIMIT } from '../src/services/searchService.js';

const hit = (id: number): SearchHit => ({
  id,
  episode: { season: 1, episode: 2, titleEn: null, titleZh: null },
  startMs: id * 1000,
  endMs: id * 1000 + 400,
  en: `sample ${id}`,
  zh: `样例 ${id}`,
  hasVideo: true,
  frameKey: null,
});

function setup(rows: SearchHit[]) {
  const calls: number[] = [];
  const lines = {
    async sampleWithVideo(limit: number) {
      calls.push(limit);
      return rows.slice(0, limit);
    },
  } as unknown as LinesRepo;
  const episodes = { async listAll() { return []; } } as unknown as EpisodesRepo;
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/api/discover', createDiscoverRoutes(createSearchService(lines, episodes, null)));
  return { app, calls };
}

const withThumbNull = (h: SearchHit) => {
  const { frameKey: _f, ...rest } = h;
  return { ...rest, thumbnailUrl: null };
};

test('固定向仓储要 9 条，原样返回 items', async () => {
  const rows = Array.from({ length: 9 }, (_, i) => hit(i + 1));
  const { app, calls } = setup(rows);
  const res = await app.request('/api/discover');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { items: rows.map(withThumbNull) });
  assert.deepEqual(calls, [DISCOVER_LIMIT]);
});

test('库存不足 9 条时有多少返回多少', async () => {
  const rows = [hit(1), hit(2)];
  const { app } = setup(rows);
  const res = await app.request('/api/discover');
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: Array<{ hasVideo: boolean }> };
  assert.equal(body.items.length, 2);
  assert.equal(body.items.every((x) => x.hasVideo), true);
});

test('查询参数被忽略，不会因此 400', async () => {
  const { app } = setup([hit(1)]);
  assert.equal((await app.request('/api/discover?q=penny')).status, 200);
});
