import { existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// pipeline/src → 仓库根目录。管线是从 npm workspace 里启动的，cwd 是 pipeline/，
// 所以所有路径都要基于仓库根算，不能依赖 cwd。
export const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export const PATHS = {
  rawVideo: path.join(REPO_ROOT, 'raw', 'video'),
  rawSubs: path.join(REPO_ROOT, 'raw', 'subs'),
  /** 手填的字幕时间偏移量；放在 raw/ 下，随素材一起不入 git */
  offsets: path.join(REPO_ROOT, 'raw', 'subs', 'offsets.json'),
  workMp4: path.join(REPO_ROOT, 'work', 'mp4'),
  qaReport: path.join(REPO_ROOT, 'work', 'qa-report.md'),
} as const;

/** 视频在存储里的对象键前缀，与手册 §3.3 的示例 tbbt/S01E01.mp4 一致。 */
const VIDEO_KEY_PREFIX = 'tbbt';

export function videoKeyFor(episodeId: string): string {
  return `${VIDEO_KEY_PREFIX}/${episodeId}.mp4`;
}

/** 台词缩略图在 R2 / 本地存储里的对象键；与 server 签发 URL 时用的 key 一致 */
export function frameKeyForLineId(lineId: number): string {
  return `${VIDEO_KEY_PREFIX}/frames/${lineId}.jpg`;
}

/**
 * 读取 .env 与 .env.local（后者由 `neon deploy` 生成）。
 * process.loadEnvFile 不会覆盖已存在的变量，所以先读的优先：
 * 真实的环境变量 > .env（用户手写）> .env.local（Neon 自动生成）。
 */
export function loadEnv(): void {
  for (const name of ['.env', '.env.local']) {
    const file = path.join(REPO_ROOT, name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

/**
 * 管线用 Neon 的直连地址：它要做批量写入和事务，不适合走连接池（pgbouncer）。
 * 没配直连地址时回退到 DATABASE_URL，兼容普通 Postgres。
 */
export function getDatabaseUrl(): string {
  loadEnv();
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('缺少数据库连接串：请在 .env 或 .env.local 里设置 DATABASE_URL_UNPOOLED（或 DATABASE_URL）');
  }
  return url;
}

export async function connectDb(): Promise<pg.Client> {
  // Neon 休眠后首次连接需要唤醒，给足 30 秒，避免误报连接失败
  const client = new pg.Client({ connectionString: getDatabaseUrl(), connectionTimeoutMillis: 30_000 });
  await client.connect();
  return client;
}
