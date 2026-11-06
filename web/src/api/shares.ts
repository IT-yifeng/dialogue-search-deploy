import { getJson, postJson } from './client';
import type { CreateShareRequest, CreateShareResponse, PlayResponse, ShareResponse } from './types';

export function createShare(body: CreateShareRequest, signal?: AbortSignal): Promise<CreateShareResponse> {
  return postJson<CreateShareResponse>('/api/shares', body, signal);
}

export function fetchShare(id: string, signal?: AbortSignal): Promise<ShareResponse> {
  return getJson<ShareResponse>(`/api/shares/${encodeURIComponent(id)}`, signal);
}

/** 分享页专用的播放接口：免口令，且后端只会为该分享里的台词签发地址 */
export function fetchSharePlay(shareId: string, lineId: number, signal?: AbortSignal): Promise<PlayResponse> {
  return getJson<PlayResponse>(`/api/shares/${encodeURIComponent(shareId)}/lines/${lineId}/play`, signal);
}
