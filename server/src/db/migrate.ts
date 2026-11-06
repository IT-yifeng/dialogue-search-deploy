// 迁移执行器：npm run db:migrate
// 只前进、不回滚（手册 §3.1）：按文件名顺序执行还没执行过的 .sql，执行记录存在 schema_migrations 表里。
// 这是一个开发/运维工具脚本，用 tsx 直接运行；.sql 文件不会被 tsc 复制到 dist，所以不要从构建产物里运行它。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

// 与 pipeline 同样的读取顺序：真实环境变量 > .env > .env.local（Neon 自动生成）。
// 两处各写一份而不共用代码，是因为手册 §3.2 规定 server 与 pipeline 互不引用。
for (const name of ['.env', '.env.local']) {
  const file = path.join(REPO_ROOT, name);
  if (existsSync(file)) process.loadEnvFile(file);
}

// 迁移要用 Neon 的直连地址（不带 -pooler），连接池的事务模式不适合做 DDL
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('缺少数据库连接串：请在 .env 或 .env.local 里设置 DATABASE_URL_UNPOOLED（或 DATABASE_URL）');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
try {
  await client.connect();
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    // 每个迁移文件一个事务：失败整体回滚，不会留下建了一半的表
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] 已执行 ${file}`);
      applied++;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  console.log(applied === 0 ? '[migrate] 没有需要执行的迁移' : `[migrate] 完成，共执行 ${applied} 个迁移`);
} catch (e) {
  console.error(`[migrate] 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
