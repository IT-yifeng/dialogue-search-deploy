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

/** 惰性创建：只有真正查询时才建池，import 本模块不会产生连接 */
function getPool(): pg.Pool {
  pool ??= new pg.Pool({
    connectionString: config.databaseUrl,
    // Neon 免费版闲置会休眠，首次唤醒要几秒，超时给宽一点
    connectionTimeoutMillis: 30_000,
    max: 10,
  });
  return pool;
}

export const db: Db = {
  query: (text, params) => getPool().query(text, params),
};
