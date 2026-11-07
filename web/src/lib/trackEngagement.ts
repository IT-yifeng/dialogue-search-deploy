// 取用事件上报：合并短窗口内的多条，失败静默（M7）。
import { postEngagementEvents, type EngagementEvent } from '../api/metrics';
import { getAnalyticsSessionId } from './analyticsSession';

const FLUSH_MS = 400;
const MAX_BATCH = 20;

let queue: EngagementEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const sessionId = getAnalyticsSessionId();
  if (!sessionId) return;
  const batch = queue.splice(0, MAX_BATCH);
  if (batch.length === 0) return;
  void postEngagementEvents(sessionId, batch).catch(() => {});
  if (queue.length > 0) timer = setTimeout(flush, FLUSH_MS);
}

export function trackEngagement(event: EngagementEvent): void {
  queue.push(event);
  if (timer === undefined) timer = setTimeout(flush, FLUSH_MS);
}
