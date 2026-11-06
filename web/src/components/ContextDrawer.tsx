import { useQuery } from '@tanstack/react-query';
import { fetchContext } from '../api/lines';
import { shouldRetry } from '../api/client';
import { pickDisplayLines, type LangMode } from '../lib/displayLines';
import { formatTime } from '../lib/formatTime';
import { HighlightText } from './HighlightText';
import { PlayIcon } from './icons';
import type { ClipRange } from './ClipPlayer';

interface Props {
  lineId: number;
  mode: LangMode;
  terms: string[];
  /** 该集没有视频时为 false：仍可查看上下文，但不能点击播放 */
  canPlay: boolean;
  onPlay: (clip: ClipRange) => void;
}

export function ContextDrawer({ lineId, mode, terms, canPlay, onPlay }: Props) {
  const ctx = useQuery({
    queryKey: ['context', lineId],
    queryFn: ({ signal }) => fetchContext(lineId, signal),
    // 台词入库后基本不变，缓存久一点，反复展开 / 收起不重复请求
    staleTime: 10 * 60 * 1000,
    retry: shouldRetry,
  });

  if (ctx.isPending) {
    return <p className="mt-3 animate-pulse text-meta text-ink-faint">加载上下文…</p>;
  }
  if (ctx.isError) {
    return (
      <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
        <span>上下文加载失败</span>
        <button
          type="button"
          onClick={() => void ctx.refetch()}
          className="shrink-0 rounded-pill border border-danger/40 bg-surface px-3.5 py-1 font-medium transition hover:bg-danger-soft active:scale-[0.98]"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <ol className="mt-3 animate-fade-up divide-y divide-line overflow-hidden rounded-card border border-line">
      {ctx.data.lines.map((l) => {
        const isCurrent = l.id === ctx.data.currentId;
        const display = pickDisplayLines(l, mode);
        return (
          <li key={l.id} className={isCurrent ? 'bg-brand-soft' : 'bg-surface'}>
            {/* 整行是一个按钮：点任意一句就从那里开始播 */}
            <button
              type="button"
              disabled={!canPlay}
              onClick={() => onPlay({ startMs: l.startMs, endMs: l.endMs })}
              aria-current={isCurrent ? 'true' : undefined}
              className="group flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition enabled:hover:bg-surface-muted disabled:cursor-default"
            >
              <span className="mt-0.5 inline-flex w-14 shrink-0 items-center gap-1 text-meta tabular-nums text-ink-faint group-enabled:group-hover:text-brand-fg">
                {canPlay && <PlayIcon className="text-[0.7rem]" />}
                {formatTime(l.startMs)}
              </span>
              <span className="min-w-0 space-y-0.5">
                {display.map((d) => (
                  <span
                    key={d.lang}
                    lang={d.lang === 'en' ? 'en' : 'zh-CN'}
                    className={`block text-sm ${isCurrent ? 'font-semibold text-ink' : d.fallback ? 'text-ink-faint' : 'text-ink-sub'}`}
                  >
                    <HighlightText text={d.text} terms={terms} />
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
