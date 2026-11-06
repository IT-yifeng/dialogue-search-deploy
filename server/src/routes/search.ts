// GET /api/search：只做参数解析与返回格式，业务交给 searchService。
import { Hono } from 'hono';
import { parseIntWithDefault, parseOptionalInt } from '../lib/queryParams.js';
import type { SearchService } from '../services/searchService.js';

/** exact=1 表示不切词、整句连续匹配（手册 §6） */
function parseExact(raw: string | undefined): boolean {
  return raw === '1';
}

export function createSearchRoutes(service: SearchService): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const result = await service.search({
      q: c.req.query('q') ?? '',
      season: parseOptionalInt(c.req.query('season'), { name: 'season', min: 1, max: 1000 }),
      exact: parseExact(c.req.query('exact')),
      page: parseIntWithDefault(c.req.query('page'), { name: 'page', min: 1, max: 100_000 }, 1),
      pageSize: parseIntWithDefault(c.req.query('pageSize'), { name: 'pageSize', min: 1, max: 50 }, 20),
    });
    return c.json(result);
  });

  return app;
}
