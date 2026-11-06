// 托管前端构建产物（Docker 镜像里的 ./public），一个服务同时提供 API 与页面（手册 §2）。
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

/** 这两个前缀属于后端：即使没匹配上路由，也要返回 JSON 404，不能被前端页面“吞掉” */
const BACKEND_PREFIXES = ['/api/', '/media/'];

/** 构建产物的文件名带内容哈希，内容变了名字就变，所以可以缓存一年 */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/**
 * @returns 目录不存在时返回 null：本地开发由 Vite 提供页面，后端不应该、也不需要托管。
 */
export function createStaticRoutes(dir: string): Hono | null {
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, 'index.html'))) return null;

  const app = new Hono();

  // 缓存头要在 serveStatic 生成响应之后再补：它的 onFound 回调触发时响应已经构建完，改头不生效
  app.use('*', async (c, next) => {
    await next();
    if (c.res.status !== 200 || c.res.headers.has('Cache-Control')) return;
    // 带哈希的资源长期缓存；其余（index.html、robots.txt）每次校验，
    // 否则发布新版本后，用户可能长时间还在用指向旧资源的旧页面
    c.header('Cache-Control', c.req.path.startsWith('/assets/') ? IMMUTABLE_CACHE : 'no-cache');
  });
  app.use('*', serveStatic({ root }));

  // SPA 回退：/s/xxx 等前端路由在服务器上没有对应文件，刷新页面时要返回 index.html，交给前端路由处理
  app.get('*', async (c) => {
    const p = c.req.path;
    const last = p.split('/').at(-1) ?? '';
    // 带扩展名的请求（如已被新版本删除的 /assets/index-旧哈希.js）是在要文件而不是页面，
    // 返回 index.html 会让浏览器收到 HTML 却当 JS 解析、报出莫名其妙的错误，直接 404 更容易排查
    if (BACKEND_PREFIXES.some((x) => p.startsWith(x)) || last.includes('.')) return c.notFound();

    const html = await readFile(path.join(root, 'index.html'), 'utf8');
    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    return c.body(html);
  });

  return app;
}
