import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { errorHandler, notFoundHandler } from '../src/lib/httpError.js';
import type { EngagementInsert, MetricsRepo, SearchMetricInsert } from '../src/repos/metricsRepo.js';
import { createMetricsRoutes } from '../src/routes/metrics.js';
import { createMetricsService, METRICS_MAX_EVENTS } from '../src/services/metricsService.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

function setup() {
  const searches: SearchMetricInsert[] = [];
  const events: EngagementInsert[] = [];
  const repo: MetricsRepo = {
    async insertSearch(row) {
      searches.push(row);
    },
    async insertEngagementEvents(rows) {
      events.push(...rows);
    },
  };
  const service = createMetricsService(repo);
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.route('/api/metrics', createMetricsRoutes(service));
  return { app, searches, events };
}

test('POST /api/metrics/events 写入多条', async () => {
  const { app, events } = setup();
  const res = await app.request('/api/metrics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: UUID,
      events: [
        { kind: 'play', lineId: 1 },
        { kind: 'copy' },
      ],
    }),
  });
  assert.equal(res.status, 204);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.kind, 'play');
  assert.equal(events[1]?.lineId, null);
});

test('events 超过上限返回 400', async () => {
  const { app } = setup();
  const events = Array.from({ length: METRICS_MAX_EVENTS + 1 }, () => ({ kind: 'copy' as const }));
  const res = await app.request('/api/metrics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: UUID, events }),
  });
  assert.equal(res.status, 400);
});

test('sessionId 非法返回 400', async () => {
  const { app } = setup();
  const res = await app.request('/api/metrics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'not-uuid', events: [{ kind: 'share' }] }),
  });
  assert.equal(res.status, 400);
});
