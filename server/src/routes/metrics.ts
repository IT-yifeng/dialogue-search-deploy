// POST /api/metrics/events：只做参数校验与返回格式。
import { Hono } from 'hono';
import { badRequest } from '../lib/httpError.js';
import type { EngagementKind } from '../repos/metricsRepo.js';
import type { MetricsService } from '../services/metricsService.js';

interface EventsBody {
  sessionId: string;
  events: Array<{ kind: EngagementKind; lineId?: number }>;
}

function parseBody(body: unknown): EventsBody {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('请求体必须是 JSON 对象');
  }
  const o = body as Record<string, unknown>;
  if (typeof o.sessionId !== 'string') throw badRequest('sessionId 必须是字符串');
  if (!Array.isArray(o.events)) throw badRequest('events 必须是数组');
  const events: EventsBody['events'] = [];
  for (const item of o.events) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw badRequest('events 每一项必须是对象');
    }
    const e = item as Record<string, unknown>;
    if (typeof e.kind !== 'string') throw badRequest('events.kind 必须是字符串');
    const kind = e.kind as EngagementKind;
    const lineId = e.lineId === undefined ? undefined : e.lineId;
    if (lineId !== undefined && typeof lineId !== 'number') throw badRequest('lineId 必须是数字');
    events.push({ kind, ...(lineId !== undefined ? { lineId } : {}) });
  }
  return { sessionId: o.sessionId, events };
}

export function createMetricsRoutes(service: MetricsService): Hono {
  const app = new Hono();

  app.post('/events', async (c) => {
    const raw: unknown = await c.req.json().catch(() => {
      throw badRequest('请求体不是合法的 JSON');
    });
    const body = parseBody(raw);
    await service.recordEvents(body.sessionId, body.events);
    return c.body(null, 204);
  });

  return app;
}
