import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEpisodes, searchLines } from '../api/search';
import { FilterBar } from '../components/FilterBar';
import { Hero } from '../components/Hero';
import { LogoMark } from '../components/icons';
import { LangToggle } from '../components/LangToggle';
import { Pagination } from '../components/Pagination';
import { ResultCard } from '../components/ResultCard';
import { ResultSkeleton } from '../components/ResultSkeleton';
import { SearchBar } from '../components/SearchBar';
import { SelectionBar } from '../components/SelectionBar';
import { ShareDialog } from '../components/ShareDialog';
import { ErrorBar, NoResults, PageOutOfRange } from '../components/StateViews';
import { ThemeToggle } from '../components/ThemeToggle';
import { useSearchParamsState } from '../hooks/useSearchParamsState';
import { splitTerms } from '../lib/highlight';
import { useLangStore } from '../store/lang';
import { useSelectionStore } from '../store/selection';

const PAGE_SIZE = 20;

export default function SearchPage() {
  const { state, submitQuery, setSeason, setPage } = useSearchParamsState();
  const { q, season, page } = state;
  const hasQuery = q !== '';
  const mode = useLangStore((s) => s.mode);
  // 勾选存在全局 store（跨搜索保留）；这里只需要知道“有没有”，用来给悬浮条让出底部空间
  const hasSelection = useSelectionStore((s) => s.items.length > 0);
  const [shareOpen, setShareOpen] = useState(false);

  const search = useQuery({
    queryKey: ['search', q, season, page],
    queryFn: ({ signal }) => searchLines({ q, season, page, pageSize: PAGE_SIZE }, signal),
    enabled: hasQuery,
    // 只在“同一关键词、同一季”翻页时保留上一页内容避免闪烁；
    // 换了关键词还显示旧结果会误导用户，那种情况走骨架屏
    placeholderData: (prev, prevQuery) =>
      prevQuery && prevQuery.queryKey[1] === q && prevQuery.queryKey[2] === season ? prev : undefined,
  });

  // 季集列表只用来生成“季”下拉；接口可缓存，所以长时间不重新请求
  const episodes = useQuery({
    queryKey: ['episodes'],
    queryFn: ({ signal }) => fetchEpisodes(signal),
    staleTime: 10 * 60 * 1000,
  });
  const seasons = useMemo(
    () => [...new Set((episodes.data?.items ?? []).map((e) => e.season))].sort((a, b) => a - b),
    [episodes.data],
  );

  const terms = useMemo(() => splitTerms(q), [q]);

  useEffect(() => {
    document.title = hasQuery ? `${q} - 台词搜索` : '台词搜索';
  }, [q, hasQuery]);

  const handlePageChange = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  const data = search.data;
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  let body;
  if (!hasQuery) {
    body = <Hero value={q} onSubmit={submitQuery} />;
  } else if (search.isError) {
    body = <ErrorBar error={search.error} onRetry={() => void search.refetch()} />;
  } else if (!data) {
    body = <ResultSkeleton />;
  } else if (data.total === 0) {
    body = <NoResults q={q} />;
  } else if (data.items.length === 0) {
    body = <PageOutOfRange onBack={() => handlePageChange(1)} />;
  } else {
    body = (
      <div className="space-y-8">
        {/* 翻页请求进行中：保留旧内容但淡化，告诉用户正在更新 */}
        <ul className={`space-y-3 transition-opacity ${search.isPlaceholderData ? 'opacity-50' : ''}`}>
          {data.items.map((item) => (
            <ResultCard key={item.id} line={item} mode={mode} terms={terms} />
          ))}
        </ul>
        <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* 顶部光晕与细网格，纯装饰 */}
      <div className={hasQuery ? 'page-backdrop page-backdrop-soft' : 'page-backdrop'} aria-hidden />

      {/* 有勾选时多留一些底部空间，避免悬浮条盖住分页 */}
      <div className={`mx-auto max-w-3xl px-4 ${hasSelection ? 'pb-40' : 'pb-20'}`}>
        <header
          className={
            hasQuery
              ? // 结果页顶栏吸顶 + 毛玻璃：滚动长列表时搜索框始终在手边
                'sticky top-0 z-20 -mx-4 border-b border-line/70 bg-surface-page/80 px-4 pb-3 pt-3 backdrop-blur-xl'
              : 'pt-4'
          }
        >
          {/* 窄屏：第一行 logo + 开关，第二行搜索框；宽屏三者排成一行（靠 order 调整，DOM 顺序保持 logo → 搜索 → 开关） */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <Link to="/" className="flex shrink-0 items-center gap-2 rounded-control text-base font-extrabold">
              <LogoMark className="h-8 w-8" />
              <span>台词搜索</span>
            </Link>
            {hasQuery && (
              <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
                <SearchBar value={q} onSubmit={submitQuery} />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <LangToggle />
              <ThemeToggle />
            </div>
          </div>
          {hasQuery && (
            <div className="mt-3">
              <FilterBar season={season} seasons={seasons} total={data?.total} onSeasonChange={setSeason} />
            </div>
          )}
        </header>

        <main className={hasQuery ? 'mt-5' : ''}>
          {hasQuery && <h1 className="sr-only">搜索结果</h1>}
          {body}
        </main>
      </div>

      <SelectionBar onOpenShare={() => setShareOpen(true)} />
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
    </div>
  );
}
