// 埋点业务：校验 + 写入；搜索日志 fire-and-forget，不拖慢搜索响应（M7）。
import { badRequest } from '../lib/httpError.js';
import type { EngagementKind, EngagementInsert, MetricsRepo, SearchMetricInsert } from '../repos/metricsRepo.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const METRICS_MAX_EVENTS = 20;

export interface MetricsService {
  /** 异步写库；失败只打日志 */
  logSearch(row: SearchMetricInsert): void;
  recordEvents(sessionId: string, events: Array<{ kind: EngagementKind; lineId?: number }>): Promise<void>;
}

function normalizeSessionId(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') return null;
  const t = raw.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

export function parseSessionHeader(raw: string | undefined): string | null {
  return normalizeSessionId(raw);
}

export function createMetricsService(repo: MetricsRepo): MetricsService {
  return {
    logSearch(row) {
      void repo.insertSearch(row).catch((err) => {
        console.error('[metrics] 写入 search_metrics 失败', err);
      });
    },

    async recordEvents(sessionId, events) {
      const sid = normalizeSessionId(sessionId);
      if (!sid) throw badRequest('sessionId 必须是 UUID');
      if (events.length === 0 || events.length > METRICS_MAX_EVENTS) {
        throw badRequest(`events 长度须在 1～${METRICS_MAX_EVENTS} 之间`);
      }
      const rows: EngagementInsert[] = [];
      for (const ev of events) {
        const kind = ev.kind;
        if (kind !== 'play' && kind !== 'select' && kind !== 'share' && kind !== 'copy') {
          throw badRequest('events.kind 不合法');
        }
        let lineId: number | null = null;
        if (ev.lineId !== undefined) {
          if (!Number.isSafeInteger(ev.lineId) || ev.lineId < 1) {
            throw badRequest('lineId 必须是正整数');
          }
          lineId = ev.lineId;
        }
        rows.push({ sessionId: sid, kind, lineId });
      }
      await repo.insertEngagementEvents(rows);
    },
  };
}
