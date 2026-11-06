// 读写 URL 里的搜索状态（q / season / page）。URL 是唯一事实来源，组件里不再另存一份。
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildSearchParams, parseSearchState, type SearchState } from '../lib/searchParams';

export function useSearchParamsState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseSearchState(params), [params]);

  // 每次变更都 push（不 replace），浏览器后退能回到上一次搜索
  const commit = useCallback(
    (next: SearchState) => setParams(buildSearchParams(next)),
    [setParams],
  );

  return {
    state,
    // 换关键词或换季，结果集已经变了，旧页码没有意义，所以统一回到第 1 页
    submitQuery: (q: string) => commit({ ...state, q: q.trim(), page: 1, lineId: undefined }),
    setSeason: (season: number | undefined) => commit({ ...state, season, page: 1, lineId: undefined }),
    setExact: (exact: boolean) => commit({ ...state, exact, page: 1, lineId: undefined }),
    setPage: (page: number) => commit({ ...state, page }),
    setLineId: (lineId: number | undefined) => commit({ ...state, lineId }),
  };
}
