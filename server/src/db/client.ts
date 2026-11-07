// Postgres 连接池。
// repos 只依赖下面的 Db 接口而不是 pg.Pool 本身：测试时可以传入指向临时 schema 的连接池，
// 不必为了测 SQL 去改全局配置。
import pg from 'pg';
import { config } from '../config.js';

export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
}

let pool: pg.Pool | undefined;

/** Neon 休眠或 pooler 踢掉闲置连接时，池里可能短暂拿到坏连接；重试 + 重建池通常可恢复 */
function isTransientConnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Connection terminated|ECONNRESET|connection timeout|timeout expired|Connection lost/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function resetPool(): Promise<void> {
  const p = pool;
  pool = undefined;
  if (p) {
    try {
      await p.end();
    } catch {
      /* 已坏的池 end 失败可忽略 */
    }
  }
}

/** 惰性创建：只有真正查询时才建池，import 本模块不会产生连接 */
function getPool(): pg.Pool {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    // Neon 免费版闲置会休眠，首次唤醒要几秒，超时给宽一点
    connectionTimeoutMillis: 30_000,
    // 闲置连接早点归还，减少用到已被 Neon 掐掉的连接
    idleTimeoutMillis: 15_000,
    max: 10,
    // 长连接保活，降低 serverless 踢闲置连接的概率
    keepAlive: true,
  });
  pool.on('error', (err) => {
    console.error('[db] 连接池异常（多为 Neon 闲置断连，下次查询会新建连接）:', err.message);
  });
  return pool;
}

export const db: Db = {
  async query(text, params) {
    const attempts = 3;
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await getPool().query(text, params);
      } catch (e) {
        last = e;
        if (!isTransientConnError(e)) throw e;
        if (i === attempts - 1) break;
        await sleep(80 * (i + 1));
        if (i >= 1) await resetPool();
      }
    }
    throw last;
  },
};
