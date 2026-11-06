import type pg from 'pg';
import type { EpisodeKey, Line } from './types.js';

export interface EpisodeRecord extends EpisodeKey {
  /** 存储里的对象键；null 表示只有文字、没有视频 */
  videoKey: string | null;
  durationMs: number | null;
  offsetMs: number;
  lines: Line[];
}

export interface LoadResult {
  episodeId: number;
  /** 新增或内容有变化的行数 */
  changed: number;
  /** 因新版台词变少而删除的尾部行数 */
  deleted: number;
}

// 单条 SQL 里的数组别太大，分批写入
const CHUNK = 1000;

/**
 * 幂等入库：以“季 + 集”为键，重复运行不会产生重复数据。
 *
 * 台词按 (episode_id, idx) 做 upsert，而不是“先删后插”：
 * 后者会让 lines.id 全部变化，M5 的分享链接里存的是 line_ids，会整体失效。
 * upsert 能让内容没变的台词保持原 id，且 WHERE 条件让未变化的行不产生写入。
 * 局限：如果清洗规则变了导致 idx 整体错位，对应位置的 id 会指向新内容——
 * 所以清洗规则稳定之后再生成分享链接。
 *
 * 每集一个事务：失败时整集回滚，库里不会出现只写了一半的一集。
 */
export async function loadEpisode(client: pg.Client, ep: EpisodeRecord): Promise<LoadResult> {
  await client.query('BEGIN');
  try {
    const epRes = await client.query<{ id: number }>(
      `INSERT INTO episodes (season, episode, video_key, duration_ms, offset_ms)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (season, episode) DO UPDATE
         SET video_key = EXCLUDED.video_key,
             duration_ms = EXCLUDED.duration_ms,
             offset_ms = EXCLUDED.offset_ms
       RETURNING id`,
      [ep.season, ep.episode, ep.videoKey, ep.durationMs, ep.offsetMs],
    );
    const episodeId = epRes.rows[0]!.id;

    let changed = 0;
    for (let i = 0; i < ep.lines.length; i += CHUNK) {
      const chunk = ep.lines.slice(i, i + CHUNK);
      const res = await client.query(
        `INSERT INTO lines (episode_id, idx, start_ms, end_ms, en, zh)
         SELECT $1::int, t.idx, t.s, t.e, t.en, t.zh
         FROM unnest($2::int[], $3::int[], $4::int[], $5::text[], $6::text[]) AS t(idx, s, e, en, zh)
         ON CONFLICT (episode_id, idx) DO UPDATE
           SET start_ms = EXCLUDED.start_ms, end_ms = EXCLUDED.end_ms, en = EXCLUDED.en, zh = EXCLUDED.zh
           WHERE (lines.start_ms, lines.end_ms, lines.en, lines.zh)
                 IS DISTINCT FROM (EXCLUDED.start_ms, EXCLUDED.end_ms, EXCLUDED.en, EXCLUDED.zh)`,
        [
          episodeId,
          chunk.map((l) => l.idx),
          chunk.map((l) => l.startMs),
          chunk.map((l) => l.endMs),
          chunk.map((l) => l.en),
          chunk.map((l) => l.zh),
        ],
      );
      changed += res.rowCount ?? 0;
    }

    // 新版台词比旧版少时，清掉多出来的尾部旧行
    const del = await client.query('DELETE FROM lines WHERE episode_id = $1 AND idx >= $2', [episodeId, ep.lines.length]);
    await client.query('COMMIT');
    return { episodeId, changed, deleted: del.rowCount ?? 0 };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
