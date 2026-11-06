import { getJson } from './client';
import type { ContextResponse, PlayResponse, SearchItem } from './types';

/** 单条台词（与 search items[] 单项同形），供深链 ?lineId= 在无搜索词时拉取 */
export function fetchLine(lineId: number, signal?: AbortSignal): Promise<SearchItem> {
  return getJson<SearchItem>(`/api/lines/${lineId}`, signal);
}

export function fetchPlay(lineId: number, signal?: AbortSignal): Promise<PlayResponse> {
  return getJson<PlayResponse>(`/api/lines/${lineId}/play`, signal);
}

/** 前后各 2 句，与手册 §7.3 一致（也是接口默认值，这里显式写出来便于阅读） */
export function fetchContext(lineId: number, signal?: AbortSignal): Promise<ContextResponse> {
  return getJson<ContextResponse>(`/api/lines/${lineId}/context?before=2&after=2`, signal);
}
