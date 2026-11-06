import { getJson } from './client';
import type { DiscoverResponse, EpisodesResponse, SearchRequest, SearchResponse } from './types';

export function searchLines(req: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
  // URLSearchParams 负责编码，用户输入里的 & # 空格等不会破坏查询串
  const params = new URLSearchParams({
    q: req.q,
    page: String(req.page),
    pageSize: String(req.pageSize),
  });
  if (req.season !== undefined) params.set('season', String(req.season));
  if (req.exact === 1) params.set('exact', '1');
  return getJson<SearchResponse>(`/api/search?${params}`, signal);
}

export function fetchDiscover(signal?: AbortSignal): Promise<DiscoverResponse> {
  return getJson<DiscoverResponse>('/api/discover', signal);
}

export function fetchEpisodes(signal?: AbortSignal): Promise<EpisodesResponse> {
  return getJson<EpisodesResponse>('/api/episodes', signal);
}
