// 关键词切分与高亮片段计算。
// 返回“片段数组”而不是 HTML 字符串：由 React 节点渲染，天然转义，
// 从根上避免台词里带 <script> 之类内容造成注入（手册 §7.3）。

/** 与后端 searchService.MAX_QUERY_LENGTH / MAX_TERMS 保持一致 */
export const MAX_QUERY_LENGTH = 50;
export const MAX_TERMS = 5;

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * 把输入拆成关键词。
 * 规则必须与后端 normalizeQuery 保持一致：按空白切（含全角空格）、忽略大小写去重、最多取前 5 个。
 * 前端只用它来决定“高亮哪些词”，真正的分词与过滤仍以后端为准，所以搜索请求里原样传 q。
 */
export function splitTerms(q: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of q.trim().split(/\s+/)) {
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
 * 高亮用关键词：`exact` 时整段不切词（与后端 `exact=1` 一致）。
 */
export function splitTermsForHighlight(q: string, exact: boolean): string[] {
  const trimmed = q.trim();
  if (trimmed === '') return [];
  if (exact) return [trimmed];
  return splitTerms(q);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 在 text 里找出所有关键词的命中区间并合并，再切成片段。
 * 每个词单独扫描、最后合并区间，这样 “ab” 与 “bc” 在 “abc” 里会整段高亮，
 * 而不是像 a|b 交替正则那样只命中先匹配到的那个。
 */
export function highlightSegments(text: string, terms: string[]): Segment[] {
  if (text === '') return [];
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    if (term === '') continue;
    // 关键词来自用户输入，必须转义，否则 “(” 或 “.*” 会让正则报错或匹配一切
    const re = new RegExp(escapeRegex(term), 'giu');
    for (const m of text.matchAll(re)) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  if (ranges.length === 0) return [{ text, hit: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}
