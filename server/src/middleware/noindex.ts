// 给所有响应加 X-Robots-Tag：这是版权素材站点，不允许被搜索引擎收录（手册 §4.2）。
// 页面里的 <meta name="robots"> 和 robots.txt 只管 HTML 与爬虫入口；
// 响应头对 JSON、视频等非 HTML 内容同样有效，三者叠加最稳。
import type { MiddlewareHandler } from 'hono';

export const noindex: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex, nofollow');
};
