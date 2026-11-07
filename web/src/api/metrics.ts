import { postJson } from './client';

export type EngagementKind = 'play' | 'select' | 'share' | 'copy';

export interface EngagementEvent {
  kind: EngagementKind;
  lineId?: number;
}

export function postEngagementEvents(sessionId: string, events: EngagementEvent[], signal?: AbortSignal): Promise<void> {
  return postJson<void>('/api/metrics/events', { sessionId, events }, signal).then(() => undefined);
}
