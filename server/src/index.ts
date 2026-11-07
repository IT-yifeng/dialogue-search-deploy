// 后端入口：创建 Hono 应用，挂载限流、路由、统一错误处理与前端静态托管。
// 手册 §4.2：不实现站点口令、gate、POST /api/auth；业务 API 与 /media/* 均匿名可访问。
import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config.js';
import { db } from './db/client.js';
import { errorHandler, notFoundHandler } from './lib/httpError.js';
import { createEpisodesRepo } from './repos/episodesRepo.js';
import { createLinesRepo } from './repos/linesRepo.js';
import { createMetricsRepo } from './repos/metricsRepo.js';
import { createSharesRepo } from './repos/sharesRepo.js';
import { mountApiRateLimits } from './middleware/rateLimit.js';
import { noindex } from './middleware/noindex.js';
import { createDiscoverRoutes } from './routes/discover.js';
import { createEpisodesRoutes } from './routes/episodes.js';
import { createLinesRoutes } from './routes/lines.js';
import { createMediaRoutes } from './routes/media.js';
import { createMetricsRoutes } from './routes/metrics.js';
import { createSearchRoutes } from './routes/search.js';
import { createSharesRoutes } from './routes/shares.js';
import { createStaticRoutes } from './routes/static.js';
import { createPlayService } from './services/playService.js';
import { createSearchService } from './services/searchService.js';
import { createMetricsService } from './services/metricsService.js';
import { createShareService } from './services/shareService.js';
import { LocalDriver } from './storage/localDriver.js';
import { R2Driver } from './storage/r2Driver.js';
import type { StorageDriver } from './storage/types.js';

const app = new Hono();
app.onError(errorHandler);
app.notFound(notFoundHandler);
app.use('*', noindex);

// 健康检查：部署平台用它判断服务是否存活
app.get('/healthz', (c) => c.json({ ok: true }));

// 依赖在这里自上而下组装：db → repos → service → routes
const linesRepo = createLinesRepo(db);

// 存储驱动由配置决定；只有 local 才需要自己提供 /media 路由，r2 由浏览器直连预签名链接
let localDriver: LocalDriver | null = null;
let storage: StorageDriver;
if (config.storageDriver === 'r2') {
  if (!config.r2) throw new Error('STORAGE_DRIVER=r2 但缺少 R2 配置'); // loadConfig 已保证，这里只是收窄类型
  storage = new R2Driver(config.r2);
} else {
  localDriver = new LocalDriver(config.mediaDir);
  storage = localDriver;
}
const searchService = createSearchService(linesRepo, createEpisodesRepo(db), storage);
const playService = createPlayService(linesRepo, storage);
const shareService = createShareService({
  shares: createSharesRepo(db),
  lines: linesRepo,
  play: playService,
  storage,
  publicBaseUrl: config.publicBaseUrl,
});
const metricsService = createMetricsService(createMetricsRepo(db));

// 限流要挂在业务路由之前，超限请求不再打到数据库
mountApiRateLimits(app);

app.route('/api/search', createSearchRoutes(searchService, metricsService));
app.route('/api/metrics', createMetricsRoutes(metricsService));
app.route('/api/discover', createDiscoverRoutes(searchService));
app.route('/api/lines', createLinesRoutes(searchService, playService));
app.route('/api/episodes', createEpisodesRoutes(searchService));
app.route('/api/shares', createSharesRoutes(shareService));
// 本地开发的视频文件服务（线上用 R2 驱动，不挂载）
if (localDriver) app.route('/media', createMediaRoutes(localDriver));

// 前端静态文件放在最后：所有 API 与 /media 路由先匹配，剩下的才回退到页面。
// 开发环境没有 ./public，createStaticRoutes 返回 null，由 Vite 提供页面
const staticRoutes = createStaticRoutes(path.resolve(process.cwd(), 'public'));
if (staticRoutes) app.route('/', staticRoutes);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] 已启动：http://localhost:${info.port}`);
});
