// 分享仓储：只写 SQL，不出现 HTTP 概念（手册 §3.2）。
import type { Db } from '../db/client.js';

export interface ShareRecord {
  id: string;
  /** 保持用户勾选顺序 */
  lineIds: number[];
  note: string | null;
  createdAt: Date;
}

export interface SharesRepo {
  /** 插入成功返回 true；ID 已被占用返回 false（交给 service 换个 ID 重试） */
  insert(p: { id: string; lineIds: number[]; note: string | null }): Promise<boolean>;
  findById(id: string): Promise<ShareRecord | null>;
  incrementView(id: string): Promise<void>;
}

export function createSharesRepo(db: Db): SharesRepo {
  return {
    async insert(p) {
      // ON CONFLICT DO NOTHING + 看影响行数：比“先查再写”少一次往返，也没有竞态
      const res = await db.query(
        `INSERT INTO shares (id, line_ids, note) VALUES ($1, $2::bigint[], $3)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [p.id, p.lineIds, p.note],
      );
      return res.rows.length === 1;
    },

    async findById(id) {
      const res = await db.query<{ id: string; line_ids: string[]; note: string | null; created_at: Date }>(
        'SELECT id, line_ids, note, created_at FROM shares WHERE id = $1',
        [id],
      );
      const r = res.rows[0];
      if (!r) return null;
      // BIGINT[] 在 pg 里是字符串数组；台词 id 远小于 2^53，转 number 不丢精度
      return { id: r.id, lineIds: r.line_ids.map(Number), note: r.note, createdAt: r.created_at };
    },

    async incrementView(id) {
      // 原子自增，并发访问也不会丢计数
      await db.query('UPDATE shares SET view_count = view_count + 1 WHERE id = $1', [id]);
    },
  };
}
