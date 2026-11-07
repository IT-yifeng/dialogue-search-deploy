// 首页推荐与搜索结果共用的「片段卡」：视频关键帧 + 季集角标 + 底部固定双语字幕条（手册 §7.2、§7.9）。
import { type MouseEvent } from 'react';
import type { SearchItem } from '../api/types';
import { useInView } from '../hooks/useInView';
import { useLinePoster } from '../hooks/useLinePoster';
import { pickDisplayLines } from '../lib/displayLines';
import { formatSeasonEpisodeLabel } from '../lib/formatTime';
import { HighlightText } from './HighlightText';
import { MAX_SELECTION, useSelectionStore } from '../store/selection';
import { trackEngagement } from '../lib/trackEngagement';
import { useToastStore } from '../store/toast';
import { CheckIcon, PlayIcon } from './icons';

export type OverlayOpenOptions = { context?: boolean };

interface Props {
  line: SearchItem;
  terms: string[];
  onOpenOverlay: (opts?: OverlayOpenOptions) => void;
  /** discover：整卡点蒙版；search：画面区点蒙版，底部为操作条 */
  variant: 'discover' | 'search';
}

function BilingualStrip({ line, terms }: { line: SearchItem; terms: string[] }) {
  const linesBoth = pickDisplayLines(line, 'both');
  return (
    <div className="shrink-0 space-y-0.5 border-t border-white/10 bg-black/90 px-3 py-2">
      {linesBoth.map((l) => (
        <p
          key={l.lang}
          lang={l.lang === 'en' ? 'en' : 'zh-CN'}
          className={`line-clamp-2 text-sm leading-snug ${
            l.lang === 'zh' ? 'text-white/95' : 'font-semibold text-white'
          }`}
        >
          <HighlightText text={l.text} terms={terms} />
        </p>
      ))}
    </div>
  );
}

export function SnippetCard({ line, terms, onOpenOverlay, variant }: Props) {
  const { ref: inViewRef, inView } = useInView();
  const poster = useLinePoster(line, inView);

  const selected = useSelectionStore((s) => s.items.some((i) => i.id === line.id));
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const showToast = useToastStore((s) => s.show);

  const handleToggle = () => {
    const r = toggleSelection(line);
    if (r === 'limit') showToast(`最多选 ${MAX_SELECTION} 条，请先取消一些再选`);
    else if (r === 'added') trackEngagement({ kind: 'select', lineId: line.id });
  };

  const openOverlay = (opts?: OverlayOpenOptions) => onOpenOverlay(opts);

  const onPictureClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('button, label, input, [role="dialog"]')) return;
    openOverlay();
  };

  const showPoster = line.hasVideo && !poster.failed && poster.ready;

  const baseCard =
    'flex aspect-[4/5] w-full min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface-muted text-left shadow-soft transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift';
  const selectedRing = selected ? 'border-brand-fg/35 bg-brand-soft/30' : '';

  return (
    <div ref={inViewRef} className={`${baseCard} ${selectedRing}`}>
      <div
        className="relative min-h-0 flex-1 cursor-pointer overflow-hidden"
        role={variant === 'discover' ? 'button' : undefined}
        tabIndex={variant === 'discover' ? 0 : undefined}
        onClick={onPictureClick}
        onKeyDown={
          variant === 'discover'
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openOverlay();
                }
              }
            : undefined
        }
      >
        {poster.useImage && poster.thumbnailUrl && (
          <img
            src={poster.thumbnailUrl}
            alt=""
            decoding="async"
            loading="lazy"
            onLoad={poster.onThumbLoad}
            onError={poster.onThumbError}
            className={`absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${showPoster ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
        {line.hasVideo && !poster.failed && !poster.useImage && (
          <video
            ref={poster.videoRef}
            muted
            playsInline
            preload="metadata"
            className={`absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${showPoster ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden
          />
        )}

        {!showPoster && (
          <div
            className="absolute inset-0 transition duration-300"
            style={{
              background: 'linear-gradient(145deg, rgb(var(--c-brand-soft)), rgb(var(--c-muted)))',
            }}
          />
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 48px rgb(0 0 0 / 0.35)' }}
        />

        <span className="absolute left-2 top-2 z-10 rounded-pill bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {formatSeasonEpisodeLabel(line.episode.season, line.episode.episode)}
        </span>

        {poster.loading && (
          <span className="absolute right-2 top-2 z-10 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
      </div>

      <BilingualStrip line={line} terms={terms} />

      {variant === 'search' && (
        <div
          className="shrink-0 border-t border-white/10 bg-black/55 px-2 py-2 backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="-my-0.5 flex cursor-pointer items-center p-1">
              <input
                type="checkbox"
                checked={selected}
                onChange={handleToggle}
                aria-label={`选择片段 ${line.id}`}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={`flex h-4 w-4 items-center justify-center rounded border-2 transition ${
                  selected ? 'border-brand bg-brand text-white' : 'border-white/45 bg-black/30'
                }`}
              >
                {selected && <CheckIcon className="text-[0.65rem]" />}
              </span>
            </label>
            <button
              type="button"
              disabled={!line.hasVideo}
              title={line.hasVideo ? undefined : '该集暂无视频'}
              onClick={() => openOverlay()}
              className="inline-flex flex-1 items-center justify-center gap-0.5 rounded-pill bg-brand-gradient px-2.5 py-1 text-[11px] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
            >
              <PlayIcon />
              播放
            </button>
            <button
              type="button"
              onClick={() => openOverlay({ context: true })}
              className="inline-flex flex-1 items-center justify-center gap-0.5 rounded-pill border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] text-white/95 hover:bg-white/20 sm:text-xs"
            >
              上下文
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
