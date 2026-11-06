// 台词仓储：只写 SQL、返回领域对象，不出现任何 HTTP 概念。
// 用户输入一律走参数化（$n）；LIKE 的通配符用 escapeLike 转义（手册 §3.2）。
import type { Db } from '../db/client.js';
import { escapeLike, escapeRegex } from '../lib/escapeLike.js';

export interface EpisodeBrief {
  season: number;
  episode: number;
  titleEn: string | null;
  titleZh: string | null;
}

export interface SearchHit {
  id: number;
  episode: EpisodeBrief;
  startMs: number;
  endMs: number;
  en: string;
  zh: string;
  hasVideo: boolean;
}

export interface ContextLine {
  id: number;
  idx: number;
  startMs: number;
  endMs: number;
  en: string;
  zh: string;
}

export interface LineContext {
  episode: EpisodeBrief;
  lines: ContextLine[];
}

export interface PlayInfo {
  startMs: number;
  endMs: number;
  /** 存储里的对象键；该集没有视频时为 null */
  videoKey: string | null;
}

export interface SearchParams {
  /** 已规范化的关键词；默认 AND， loose 模式下用 OR（见 mode） */
  terms: string[];
  season?: number;
  limit: number;
  offset: number;
  /**
   * `and`：每个词都要命中；`or`：任一命中即可，用于多词 AND 无结果时的兜底。
   * 只有一个词时两种写法等价，排序也只依赖整词加权。
   */
  mode?: 'and' | 'or';
  /**
   * `exact`：整段不切词，terms 仅有 1 个元素，按连续子串匹配；不参与 OR 兜底。
   */
  exact?: boolean;
}

export interface LinesRepo {
  search(p: SearchParams): Promise<{ total: number; items: SearchHit[] }>;
  /** 台词不存在时返回 null */
  findContext(id: number, before: number, after: number): Promise<LineContext | null>;
  /** 播放所需的最小信息；台词不存在时返回 null */
  findPlayInfo(id: number): Promise<PlayInfo | null>;
  /**
   * 按 id 批量取台词（分享用）。返回顺序不保证与入参一致，不存在的 id 直接缺席，
   * 排序和“缺了怎么办”都留给 service 决定。
   */
  findByIds(ids: number[]): Promise<SearchHit[]>;
  /**
   * 从有视频的台词里均匀随机抽 limit 条。不足 limit 时有多少返回多少。
   * 每次调用重新抽样，不缓存。
   */
  sampleWithVideo(limit: number): Promise<SearchHit[]>;
}

// 只有以英文字母 / 数字开头和结尾的词才做整词加权：
// \m \M 判断的是“单词边界”，中文或首尾是标点的词没有这个概念，加权只会白白增加开销。
const WHOLE_WORD_TERM = /^[A-Za-z0-9](.*[A-Za-z0-9])?$/;

interface SearchRow {
  id: string; // BIGSERIAL 在 pg 里是字符串
  season: number;
  episode: number;
  title_en: string | null;
  title_zh: string | null;
  start_ms: number;
  end_ms: number;
  en: string;
  zh: string;
  has_video: boolean;
}

function toHit(r: SearchRow): SearchHit {
  return {
    id: Number(r.id),
    episode: {
      season: r.season,
      episode: r.episode,
      titleEn: r.title_en,
      titleZh: r.title_zh,
    },
    startMs: r.start_ms,
    endMs: r.end_ms,
    en: r.en,
    zh: r.zh,
    hasVideo: r.has_video,
  };
}

export function createLinesRepo(db: Db): LinesRepo {
  return {
    async search(p) {
      // 筛选条件的参数必须排在最前，这样 count 查询可以只带这部分参数——
      // Postgres 不允许传入 SQL 里没引用的参数，否则会报“无法确定参数类型”。
      const mode = p.exact ? 'and' : (p.mode ?? 'and');
      const params: unknown[] = [p.season ?? null];
      const baseConds: string[] = ['($1::int IS NULL OR e.season = $1)'];
      const termStartIdx = params.length + 1;
      const termConds: string[] = [];
      for (const t of p.terms) {
        params.push(`%${escapeLike(t)}%`);
        const i = params.length;
        // ILIKE + trigram 索引：中英文都是子串匹配，不依赖中文分词
        termConds.push(`(l.en ILIKE $${i} ESCAPE '\\' OR l.zh ILIKE $${i} ESCAPE '\\')`);
      }
      const termWhere =
        termConds.length === 0
          ? 'true'
          : termConds.length === 1
            ? termConds[0]!
            : mode === 'or'
              ? `(${termConds.join(' OR ')})`
              : `(${termConds.join(' AND ')})`;
      const where = [...baseConds, termWhere].join(' AND ');
      const countParams = [...params];

      // OR 且多词时：命中词数越多越好（手册 §6）
      let matchCountExpr = '0::int';
      if (mode === 'or' && p.terms.length > 1) {
        const pieces: string[] = [];
        for (let ti = 0; ti < p.terms.length; ti++) {
          const i = termStartIdx + ti;
          pieces.push(
            `(CASE WHEN (l.en ILIKE $${i} ESCAPE '\\' OR l.zh ILIKE $${i} ESCAPE '\\') THEN 1 ELSE 0 END)`,
          );
        }
        matchCountExpr = pieces.join(' + ');
      }

      // 排序：英文整词命中的词越多越靠前 → 季 → 集 → 集内序号 → id。
      // 后面几项合起来是全序，翻页时不会出现重复或遗漏。
      const rank: string[] = [];
      for (const t of p.terms) {
        if (!WHOLE_WORD_TERM.test(t)) continue;
        params.push(`\\m${escapeRegex(t)}\\M`);
        rank.push(`(CASE WHEN l.en ~* $${params.length} THEN 1 ELSE 0 END)`);
      }
      // 没有可加权的词时不能写 ORDER BY 0：单独一个整数常量会被 Postgres 当成“第 0 列”而报错，
      // 带上类型转换就变成普通表达式了
      const rankExpr = rank.length > 0 ? rank.join(' + ') : '0::int';
      const orderPrimary =
        mode === 'or' && p.terms.length > 1
          ? `(${matchCountExpr}) DESC, (${rankExpr}) DESC`
          : `(${rankExpr}) DESC`;
      params.push(p.limit, p.offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      const [pageRes, countRes] = await Promise.all([
        db.query<SearchRow>(
          `SELECT l.id, e.season, e.episode, e.title_en, e.title_zh,
                  l.start_ms, l.end_ms, l.en, l.zh,
                  (e.video_key IS NOT NULL) AS has_video
           FROM lines l
           JOIN episodes e ON e.id = l.episode_id
           WHERE ${where}
           ORDER BY ${orderPrimary}, e.season, e.episode, l.idx, l.id
           LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          params,
        ),
        db.query<{ total: string }>(
          `SELECT count(*) AS total
           FROM lines l
           JOIN episodes e ON e.id = l.episode_id
           WHERE ${where}`,
          countParams,
        ),
      ]);

      return {
        total: Number(countRes.rows[0]?.total ?? 0),
        items: pageRes.rows.map(toHit),
      };
    },

    async findByIds(ids) {
      if (ids.length === 0) return [];
      // ANY($1::bigint[]) 把整个数组作为一个参数传入，既参数化又不用拼接 IN 列表
      const res = await db.query<SearchRow>(
        `SELECT l.id, e.season, e.episode, e.title_en, e.title_zh,
                l.start_ms, l.end_ms, l.en, l.zh,
                (e.video_key IS NOT NULL) AS has_video
         FROM lines l
         JOIN episodes e ON e.id = l.episode_id
         WHERE l.id = ANY($1::bigint[])`,
        [ids],
      );
      return res.rows.map(toHit);
    },

    async sampleWithVideo(limit) {
      // ORDER BY random() 对每一行等概率，符合「均匀随机」。
      // 8 万行规模下对这个只在首页调用一次的接口可以接受；不要换成 TABLESAMPLE，小表上它不均匀。
      const res = await db.query<SearchRow>(
        `SELECT l.id, e.season, e.episode, e.title_en, e.title_zh,
                l.start_ms, l.end_ms, l.en, l.zh,
                true AS has_video
         FROM lines l
         JOIN episodes e ON e.id = l.episode_id
         WHERE e.video_key IS NOT NULL
         ORDER BY random()
         LIMIT $1`,
        [limit],
      );
      return res.rows.map(toHit);
    },

    async findPlayInfo(id) {
      const res = await db.query<{ start_ms: number; end_ms: number; video_key: string | null }>(
        `SELECT l.start_ms, l.end_ms, e.video_key
         FROM lines l
         JOIN episodes e ON e.id = l.episode_id
         WHERE l.id = $1`,
        [id],
      );
      const r = res.rows[0];
      if (!r) return null;
      return { startMs: r.start_ms, endMs: r.end_ms, videoKey: r.video_key };
    },

    async findContext(id, before, after) {
      const anchorRes = await db.query<{
        episode_id: number;
        idx: number;
        season: number;
        episode: number;
        title_en: string | null;
        title_zh: string | null;
      }>(
        `SELECT l.episode_id, l.idx, e.season, e.episode, e.title_en, e.title_zh
         FROM lines l
         JOIN episodes e ON e.id = l.episode_id
         WHERE l.id = $1`,
        [id],
      );
      const anchor = anchorRes.rows[0];
      if (!anchor) return null;

      // 限定 episode_id 保证不会跨集；idx 在集内连续，集首 / 集尾自然得到更少的条数
      const linesRes = await db.query<{
        id: string;
        idx: number;
        start_ms: number;
        end_ms: number;
        en: string;
        zh: string;
      }>(
        `SELECT id, idx, start_ms, end_ms, en, zh
         FROM lines
         WHERE episode_id = $1 AND idx BETWEEN $2 AND $3
         ORDER BY idx`,
        [anchor.episode_id, anchor.idx - before, anchor.idx + after],
      );

      return {
        episode: {
          season: anchor.season,
          episode: anchor.episode,
          titleEn: anchor.title_en,
          titleZh: anchor.title_zh,
        },
        lines: linesRes.rows.map((r) => ({
          id: Number(r.id),
          idx: r.idx,
          startMs: r.start_ms,
          endMs: r.end_ms,
          en: r.en,
          zh: r.zh,
        })),
      };
    },
  };
}
