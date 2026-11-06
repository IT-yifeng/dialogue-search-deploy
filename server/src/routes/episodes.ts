// GET /api/episodes：季集列表，供前端筛选器使用。
import { Hono } from 'hono';
import type { SearchService } from '../services/searchService.js';

export function createEpisodesRoutes(service: SearchService): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const items = await service.listEpisodes();
    // 列表只在入库新语料时才变化，缓存 5 分钟省掉大部分请求。
    // 用 private 而不是 public：后续接口会加站点门禁，不能让共享缓存把受保护内容发给未登录的人。
    c.header('Cache-Control', 'private, max-age=300');
    return c.json({ items });
  });

  return app;
}
