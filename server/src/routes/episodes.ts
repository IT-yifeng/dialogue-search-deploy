// GET /api/episodes：季集列表，供前端筛选器使用。
import { Hono } from 'hono';
import type { SearchService } from '../services/searchService.js';

export function createEpisodesRoutes(service: SearchService): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const items = await service.listEpisodes();
    // 列表只在入库新语料时才变化，缓存 5 分钟省掉大部分请求。
    // 用 private：避免共享代理/CDN 把同一响应发给不同访客（手册 §4.2 仍要求业务数据不走路由缓存旁路混用）。
    c.header('Cache-Control', 'private, max-age=300');
    return c.json({ items });
  });

  return app;
}
