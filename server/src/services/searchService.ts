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
/** 首页推荐条数（手册 §6 GET /api/discover） */
export const DISCOVER_LIMIT = 9;

function validateQueryLength(trimmed: string): void {
  if (trimmed === '') throw badRequest('q 不能为空');
  if (Array.from(trimmed).length > MAX_QUERY_LENGTH) {
    throw badRequest(`q 最长 ${MAX_QUERY_LENGTH} 个字符`);
  }
}

/**
 * 把用户输入拆成关键词：按空白切分（含全角空格）、去重（忽略大小写）、最多取前 MAX_TERMS 个。
 * 长度校验交给 validateQueryLength；空串会抛 400。
 */
export function splitTermsFromQuery(trimmed: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of trimmed.split(/\s+/)) {
    if (t === '') continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(t);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/**
 * 普通搜索用的分词（与前端 splitTerms 规则一致）。
 */
export function normalizeQuery(q: string): string[] {
  const trimmed = q.trim();
  validateQueryLength(trimmed);
  return splitTermsFromQuery(trimmed);
}

export interface SearchInput {
  q: string;
  season?: number;
  /** `exact=1`：不切词，整段连续匹配（手册 §6） */
  exact?: boolean;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  /** 多词 AND 无结果时放宽为 OR 时为 true（exact 模式永为 false） */
  relaxed: boolean;
  items: SearchHit[];
}

export interface ContextResult {
  episode: EpisodeBrief;
  currentId: number;
  lines: ContextLine[];
}

export interface DiscoverResult {
  items: SearchHit[];
}

export interface SearchService {
  search(input: SearchInput): Promise<SearchResult>;
  /** 有视频的台词中随机抽 DISCOVER_LIMIT 条；库存不足时少返回，不报错 */
  discover(): Promise<DiscoverResult>;
  /** 按 id 取一条台词（深链 `?lineId=` 用）；不存在返回 null */
  getLine(id: number): Promise<SearchHit | null>;
  getContext(id: number, before: number, after: number): Promise<ContextResult>;
  listEpisodes(): Promise<EpisodeListItem[]>;
}

export function createSearchService(lines: LinesRepo, episodes: EpisodesRepo): SearchService {
  return {
    async search({ q, season, page, pageSize, exact }) {
      const trimmed = q.trim();
      validateQueryLength(trimmed);

      const limit = pageSize;
      const offset = (page - 1) * pageSize;

      if (exact) {
        const { total, items } = await lines.search({
          terms: [trimmed],
          season,
          limit,
          offset,
          mode: 'and',
          exact: true,
        });
        return { total, page, pageSize, relaxed: false, items };
      }

      const terms = splitTermsFromQuery(trimmed);
      const base = { season, limit, offset, exact: false as const };

      // 只有一词时 AND / OR 等价，直接一次查询即可
      if (terms.length <= 1) {
        const { total, items } = await lines.search({
          ...base,
          terms,
          mode: 'and',
        });
        return { total, page, pageSize, relaxed: false, items };
      }

      const strict = await lines.search({ ...base, terms, mode: 'and' });
      if (strict.total > 0) {
        return { total: strict.total, page, pageSize, relaxed: false, items: strict.items };
      }

      const loose = await lines.search({ ...base, terms, mode: 'or' });
      return {
        total: loose.total,
        page,
        pageSize,
        relaxed: loose.total > 0,
        items: loose.items,
      };
    },

    async discover() {
      return { items: await lines.sampleWithVideo(DISCOVER_LIMIT) };
    },

    async getLine(id) {
      const rows = await lines.findByIds([id]);
      return rows[0] ?? null;
    },

    async getContext(id, before, after) {
      const ctx = await lines.findContext(id, before, after);
      if (!ctx) throw notFound('台词不存在');
      return { episode: ctx.episode, currentId: id, lines: ctx.lines };
    },

    listEpisodes: () => episodes.listAll(),
  };
}
