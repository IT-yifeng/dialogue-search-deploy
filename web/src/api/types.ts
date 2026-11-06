// 与手册 §6 的 API 契约一一对应。改契约时先改手册，再改这里。

export interface EpisodeBrief {
  season: number;
  episode: number;
  titleEn: string | null;
  titleZh: string | null;
}

export interface SearchItem {
  id: number;
  episode: EpisodeBrief;
  startMs: number;
  endMs: number;
  en: string;
  zh: string;
  hasVideo: boolean;
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  items: SearchItem[];
}

export interface EpisodeListItem extends EpisodeBrief {
  hasVideo: boolean;
}

export interface EpisodesResponse {
  items: EpisodeListItem[];
}

export interface SearchRequest {
  q: string;
  season?: number;
  page: number;
  pageSize: number;
}

// GET /api/lines/:id/play
export interface PlayResponse {
  url: string;
  /** 台词本身的起止，不含前后缓冲（缓冲由 clipWindow 处理） */
  startMs: number;
  endMs: number;
  /** 链接过期时间，秒级时间戳 */
  expiresAt: number;
}

// GET /api/lines/:id/context
export interface ContextLine {
  id: number;
  idx: number;
  startMs: number;
  endMs: number;
  en: string;
  zh: string;
}

export interface ContextResponse {
  episode: EpisodeBrief;
  currentId: number;
  lines: ContextLine[];
}

// POST /api/shares
export interface CreateShareRequest {
  lineIds: number[];
  note?: string;
}

export interface CreateShareResponse {
  id: string;
  /** 由后端用 PUBLIC_BASE_URL 拼好的完整链接 */
  url: string;
}

// GET /api/shares/:id（不含播放 URL，点播放时再取，见手册 §6）
export interface ShareResponse {
  id: string;
  note: string | null;
  createdAt: string;
  items: SearchItem[];
}
