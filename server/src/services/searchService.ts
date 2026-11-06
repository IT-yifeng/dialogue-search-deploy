// 搜索与上下文的业务层：参数规范化、分页换算、组装契约结构（手册 §6）。
// 这里不碰 SQL（交给 repos），也不碰 HTTP（交给 routes）。
import { badRequest, notFound } from '../lib/httpError.js';
import type { EpisodeBrief, ContextLine, LinesRepo, SearchHit } from '../repos/linesRepo.js';
import type { EpisodeListItem, EpisodesRepo } from '../repos/episodesRepo.js';

// 手册 §5：关键词长度上限 50 字符
export const MAX_QUERY_LENGTH = 50;
// 每多一个词就多一组 ILIKE 条件；限制个数防止恶意长查询拖慢数据库
export const MAX_TERMS = 5;

export const CONTEXT_MAX = 5;

/**
 * 把用户输入拆成关键词：按空白切分（含全角空格）、去重（忽略大小写）、最多取前 MAX_TERMS 个。
 * 输入为空或超长会抛 400。长度按“字符”而不是 UTF-16 码元计，避免 emoji 被算成两个。
 */
export function normalizeQuery(q: string): string[] {
  const trimmed = q.trim();
  if (trimmed === '') throw badRequest('q 不能为空');
  if (Array.from(trimmed).length > MAX_QUERY_LENGTH) {
    throw badRequest(`q 最长 ${MAX_QUERY_LENGTH} 个字符`);
  }
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of trimmed.split(/\s+/)) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(t);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

export interface SearchInput {
  q: string;
  season?: number;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  items: SearchHit[];
}

export interface ContextResult {
  episode: EpisodeBrief;
  currentId: number;
  lines: ContextLine[];
}

export interface SearchService {
  search(input: SearchInput): Promise<SearchResult>;
  getContext(id: number, before: number, after: number): Promise<ContextResult>;
  listEpisodes(): Promise<EpisodeListItem[]>;
}

export function createSearchService(lines: LinesRepo, episodes: EpisodesRepo): SearchService {
  return {
    async search({ q, season, page, pageSize }) {
      const terms = normalizeQuery(q);
      const { total, items } = await lines.search({
        terms,
        season,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return { total, page, pageSize, items };
    },

    async getContext(id, before, after) {
      const ctx = await lines.findContext(id, before, after);
      if (!ctx) throw notFound('台词不存在');
      return { episode: ctx.episode, currentId: id, lines: ctx.lines };
    },

    listEpisodes: () => episodes.listAll(),
  };
}
