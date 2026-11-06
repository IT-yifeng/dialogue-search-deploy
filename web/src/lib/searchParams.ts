// URL 查询串 ⇄ 搜索状态。URL 是关键词、季、页码的唯一事实来源（手册 §7.5）。
// 抽成纯函数，是为了不依赖 React Router 也能单测。
import { MAX_QUERY_LENGTH } from './highlight';

export interface SearchState {
  q: string;
  season?: number;
  page: number;
}

/** 与后端 page / season 的上限保持一致，超出就当作非法值 */
const MAX_PAGE = 100_000;
const MAX_SEASON = 1000;

function parsePositiveInt(raw: string | null, max: number): number | undefined {
  // 只接受纯数字：Number('1e2') / Number('0x10') 之类会被 Number() 放行，这里要挡掉
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 1 && n <= max ? n : undefined;
}

/** 读取时容错：手改 URL 写出非法值时回退默认，而不是让页面报错 */
export function parseSearchState(params: URLSearchParams): SearchState {
  // 超长的 q 截断到上限，避免一刷新就必然撞上后端 400
  const q = Array.from((params.get('q') ?? '').trim()).slice(0, MAX_QUERY_LENGTH).join('');
  return {
    q,
    season: parsePositiveInt(params.get('season'), MAX_SEASON),
    page: parsePositiveInt(params.get('page'), MAX_PAGE) ?? 1,
  };
}

/** 写入时省略默认值（第 1 页、全部季、空关键词），保持 URL 干净 */
export function buildSearchParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q !== '') params.set('q', state.q);
  if (state.season !== undefined) params.set('season', String(state.season));
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}
