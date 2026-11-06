// GET /api/discover：首页空态的随机推荐。无查询参数，业务交给 searchService。
import { Hono } from 'hono';
import type { SearchService } from '../services/searchService.js';

export function createDiscoverRoutes(service: SearchService): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    // 推荐结果每次都变，不能被浏览器或中间层缓存
    c.header('Cache-Control', 'no-store');
    return c.json(await service.discover());
  });

  return app;
}
