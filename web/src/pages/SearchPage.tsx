import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLine } from '../api/lines';
import { fetchEpisodes, searchLines } from '../api/search';
import type { SearchItem } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { Hero } from '../components/Hero';
import { LogoMark } from '../components/icons';
import { LangToggle } from '../components/LangToggle';
import { Pagination } from '../components/Pagination';
import { SearchResultGrid } from '../components/SearchResultGrid';
import { ResultSkeleton } from '../components/ResultSkeleton';
import { SearchBar } from '../components/SearchBar';
import { SearchResultOverlay } from '../components/SearchResultOverlay';
import { SelectionBar } from '../components/SelectionBar';
import { ShareDialog } from '../components/ShareDialog';
import { ErrorBar, NoResults, PageOutOfRange } from '../components/StateViews';
import { ThemeToggle } from '../components/ThemeToggle';
import { useSearchParamsState } from '../hooks/useSearchParamsState';
import { splitTermsForHighlight } from '../lib/highlight';
import { buildSearchParams } from '../lib/searchParams';
import { copyToClipboard } from '../lib/copyText';
import { useToastStore } from '../store/toast';
import { useLangStore } from '../store/lang';
import { useSelectionStore } from '../store/selection';

const PAGE_SIZE = 20;

type OverlayState =
  | { source: 'search'; lines: SearchItem[]; index: number }
  | { source: 'discover'; lines: SearchItem[]; index: number };

export default function SearchPage() {
  const { state, submitQuery, setSeason, setPage, setExact, setLineId } = useSearchParamsState();
  const { q, season, page, exact, lineId } = state;
  const hasQuery = q !== '';
  const mode = useLangStore((s) => s.mode);
  const hasSelection = useSelectionStore((s) => s.items.length > 0);
  const showToast = useToastStore((s) => s.show);
  const [shareOpen, setShareOpen] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  /** 蒙版里「上一条 / 下一条」跨页时，等新页数据到了再定位到哪一条 */
  const pagePickRef = useRef<'first' | 'last' | null>(null);

  const deepLine = useQuery({
    queryKey: ['line', lineId],
    queryFn: ({ signal }) => fetchLine(lineId!, signal),
    enabled: !hasQuery && lineId !== undefined,
    retry: false,
  });

  const search = useQuery({
    queryKey: ['search', q, season, exact, page],
    queryFn: ({ signal }) =>
      searchLines({ q, season, exact: exact ? 1 : undefined, page, pageSize: PAGE_SIZE }, signal),
    enabled: hasQuery,
    placeholderData: (prev, prevQuery) =>
      prevQuery &&
      prevQuery.queryKey[1] === q &&
      prevQuery.queryKey[2] === season &&
      prevQuery.queryKey[3] === exact
        ? prev
        : undefined,
  });

  const episodes = useQuery({
    queryKey: ['episodes'],
    queryFn: ({ signal }) => fetchEpisodes(signal),
    staleTime: 10 * 60 * 1000,
  });
  const seasons = useMemo(
    () => [...new Set((episodes.data?.items ?? []).map((e) => e.season))].sort((a, b) => a - b),
    [episodes.data],
  );

  const terms = useMemo(() => splitTermsForHighlight(q, exact), [q, exact]);
  const emptyTerms = useMemo(() => [] as string[], []);

  const data = search.data;
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setLineId(undefined);
  }, [setLineId]);

  const openSearchOverlay = useCallback(
    (lines: SearchItem[], index: number) => {
      setOverlay({ source: 'search', lines, index });
      setLineId(lines[index]?.id);
    },
    [setLineId],
  );

  const handleDiscoverPick = useCallback(
    (lines: SearchItem[], line: SearchItem, index: number) => {
      if (lines.length === 0) return;
      setOverlay({ source: 'discover', lines, index });
      setLineId(line.id);
    },
    [setLineId],
  );

  // 深链 ?lineId=：有搜索词时在结果里定位；无搜索词（首页）时 GET /api/lines/:id 拉单条再开蒙版
  useEffect(() => {
    if (lineId === undefined || overlay !== null) return;
    if (hasQuery) {
      if (!data?.items?.length) return;
      const idx = data.items.findIndex((x) => x.id === lineId);
      if (idx >= 0) setOverlay({ source: 'search', lines: data.items, index: idx });
      return;
    }
    if (deepLine.data) setOverlay({ source: 'discover', lines: [deepLine.data], index: 0 });
  }, [hasQuery, lineId, data?.items, overlay, deepLine.data]);

  // 蒙版跨页：翻页后数据到了再对齐 overlay
  useEffect(() => {
    if (!hasQuery || !data?.items?.length || pagePickRef.current === null) return;
    const pick = pagePickRef.current;
    pagePickRef.current = null;
    const idx = pick === 'first' ? 0 : data.items.length - 1;
    const line = data.items[idx];
    if (!line) return;
    setOverlay({ source: 'search', lines: data.items, index: idx });
    setLineId(line.id);
  }, [hasQuery, data?.items, setLineId]);

  useEffect(() => {
    pagePickRef.current = null;
  }, [q, season, exact]);

  useEffect(() => {
    document.title = hasQuery ? `${q} - 台词搜索` : '台词搜索';
  }, [q, hasQuery]);

  const handlePageChange = (p: number) => {
    pagePickRef.current = null;
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  const buildLineDeepLink = useCallback(
    (id: number) => {
      const params = buildSearchParams({ ...state, lineId: id });
      return `${window.location.origin}${window.location.pathname}?${params}`;
    },
    [state],
  );

  const overlayLine = overlay ? overlay.lines[overlay.index] ?? null : null;
  const shareUrl = overlayLine ? buildLineDeepLink(overlayLine.id) : '';

  const overlayPrevNext = useMemo(() => {
    if (!overlay) return { prev: () => {}, next: () => {}, dPrev: true, dNext: true };
    const { lines, index, source } = overlay;
    const n = lines.length;
    if (source === 'discover') {
      return {
        prev: () => {
          const ni = (index - 1 + n) % n;
          setOverlay({ source: 'discover', lines, index: ni });
          setLineId(lines[ni]!.id);
        },
        next: () => {
          const ni = (index + 1) % n;
          setOverlay({ source: 'discover', lines, index: ni });
          setLineId(lines[ni]!.id);
        },
        dPrev: false,
        dNext: false,
      };
    }
    const disablePrev = index <= 0 && page <= 1;
    const disableNext = index >= n - 1 && page >= totalPages;
    return {
      prev: () => {
        if (index > 0) {
          const ni = index - 1;
          setOverlay({ source: 'search', lines, index: ni });
          setLineId(lines[ni]!.id);
          return;
        }
        if (page > 1) {
          pagePickRef.current = 'last';
          setPage(page - 1);
        }
      },
      next: () => {
        if (index < n - 1) {
          const ni = index + 1;
          setOverlay({ source: 'search', lines, index: ni });
          setLineId(lines[ni]!.id);
          return;
        }
        if (page < totalPages) {
          pagePickRef.current = 'first';
          setPage(page + 1);
        }
      },
      dPrev: disablePrev,
      dNext: disableNext,
    };
  }, [overlay, page, totalPages, setLineId, setPage]);

  const onCopyDeepLink = useCallback(async () => {
    if (!overlayLine) return;
    const ok = await copyToClipboard(buildLineDeepLink(overlayLine.id));
    showToast(ok ? '链接已复制' : '复制失败，请手动复制地址栏');
  }, [overlayLine, buildLineDeepLink, showToast]);

  let body;
  if (!hasQuery) {
    body = (
      <Hero
        value={q}
        onSubmit={submitQuery}
        mode={mode}
        highlightTerms={emptyTerms}
        onDiscoverPick={(line, i, all) => handleDiscoverPick(all, line, i)}
      />
    );
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
        {data.relaxed && (
          <p
            role="status"
            className="rounded-card border border-brand-fg/25 bg-brand-soft/40 px-4 py-3 text-sm text-ink"
          >
            没有同时包含全部关键词的台词，下面是包含部分词的结果
          </p>
        )}
        {!exact && data.total > 2000 && (
          <p className="text-center text-sm text-ink-sub">
            结果较多，试试开启「仅完整台词」收紧匹配
          </p>
        )}
        <div className={`transition-opacity ${search.isPlaceholderData ? 'opacity-50' : ''}`}>
          <SearchResultGrid items={data.items} terms={terms} onOpenOverlay={(i) => openSearchOverlay(data.items, i)} />
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className={hasQuery ? 'page-backdrop page-backdrop-soft' : 'page-backdrop'} aria-hidden />

      <div className={`mx-auto max-w-6xl px-4 ${hasSelection ? 'pb-40' : 'pb-20'}`}>
        <header
          className={
            hasQuery
              ? 'sticky top-0 z-20 -mx-4 border-b border-line/70 bg-surface-page/80 px-4 pb-3 pt-3 backdrop-blur-xl'
              : 'pt-4'
          }
        >
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
              <FilterBar
                season={season}
                exact={exact}
                seasons={seasons}
                total={data?.total}
                onSeasonChange={setSeason}
                onExactChange={setExact}
              />
            </div>
          )}
        </header>

        <main className={hasQuery ? 'mt-5' : ''}>
          {hasQuery && <h1 className="sr-only">搜索结果</h1>}
          {body}
        </main>
      </div>

      <SearchResultOverlay
        open={overlay !== null}
        line={overlayLine}
        mode={mode}
        terms={terms}
        onClose={closeOverlay}
        onPrev={overlayPrevNext.prev}
        onNext={overlayPrevNext.next}
        disablePrev={overlayPrevNext.dPrev}
        disableNext={overlayPrevNext.dNext}
        shareUrl={shareUrl}
        onCopyLink={onCopyDeepLink}
      />

      <SelectionBar onOpenShare={() => setShareOpen(true)} />
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
    </div>
  );
}
