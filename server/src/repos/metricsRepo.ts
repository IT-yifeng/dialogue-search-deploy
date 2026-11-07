// 埋点仓储：只写 SQL（手册 §3.2）。
import type { Db } from '../db/client.js';

export type EngagementKind = 'play' | 'select' | 'share' | 'copy';

export interface SearchMetricInsert {
  sessionId: string | null;
  q: string;
  exact: boolean;
  season: number | null;
  resultTotal: number;
  relaxed: boolean;
}

export interface EngagementInsert {
  sessionId: string;
  kind: EngagementKind;
  lineId: number | null;
}

export interface MetricsRepo {
  insertSearch(row: SearchMetricInsert): Promise<void>;
  insertEngagementEvents(rows: EngagementInsert[]): Promise<void>;
}

export function createMetricsRepo(db: Db): MetricsRepo {
  return {
    async insertSearch(row) {
      await db.query(
        `INSERT INTO search_metrics (session_id, q, exact, season, result_total, relaxed)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.sessionId, row.q, row.exact, row.season, row.resultTotal, row.relaxed],
      );
    },

    async insertEngagementEvents(rows) {
      if (rows.length === 0) return;
      const sessionIds: string[] = [];
      const kinds: string[] = [];
      const lineIds: (number | null)[] = [];
      for (const r of rows) {
        sessionIds.push(r.sessionId);
        kinds.push(r.kind);
        lineIds.push(r.lineId);
      }
      await db.query(
        `INSERT INTO engagement_events (session_id, kind, line_id)
         SELECT * FROM UNNEST($1::text[], $2::text[], $3::bigint[])`,
        [sessionIds, kinds, lineIds],
      );
    },
  };
}
