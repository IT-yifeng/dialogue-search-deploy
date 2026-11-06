// GET /api/lines/:id/context 与 GET /api/lines/:id/play。
import { Hono } from 'hono';
import { badRequest } from '../lib/httpError.js';
import { parseIntWithDefault, parseOptionalInt } from '../lib/queryParams.js';
import type { PlayService } from '../services/playService.js';
import { CONTEXT_MAX, type SearchService } from '../services/searchService.js';

/** id 对应 BIGSERIAL，必须是正的安全整数，否则交给数据库会报类型 / 溢出错误 */
function parseLineId(raw: string | undefined): number {
  const id = parseOptionalInt(raw, { name: 'id', min: 1, max: Number.MAX_SAFE_INTEGER });
  if (id === undefined) throw badRequest('id 必须是正整数');
  return id;
}

export function createLinesRoutes(service: SearchService, play: PlayService): Hono {
  const app = new Hono();

  app.get('/:id/context', async (c) => {
    const id = parseLineId(c.req.param('id'));
    const rule = { min: 0, max: CONTEXT_MAX };
    const before = parseIntWithDefault(c.req.query('before'), { name: 'before', ...rule }, 2);
    const after = parseIntWithDefault(c.req.query('after'), { name: 'after', ...rule }, 2);
    return c.json(await service.getContext(id, before, after));
  });

  app.get('/:id/play', async (c) => {
    const id = parseLineId(c.req.param('id'));
    // 播放链接带有时效，不能被浏览器或中间层缓存，否则过期后还会拿到旧链接
    c.header('Cache-Control', 'no-store');
    return c.json(await play.getPlay(id));
  });

  return app;
}
