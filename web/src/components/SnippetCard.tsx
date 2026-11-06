// 首页推荐与搜索结果共用的「片段卡」：视频关键帧 + 季集角标 + 底部双语字幕（手册 §7.2、§7.9）。
// 跨域 R2 下 canvas 会污染，无法用截图；统一用 <video> 静帧展示关键帧。
import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import type { SearchItem } from '../api/types';
import { useVideoPosterFrame } from '../hooks/useVideoPosterFrame';
import { pickDisplayLines } from '../lib/displayLines';
import { formatSeasonEpisodeLabel } from '../lib/formatTime';
import { HighlightText } from './HighlightText';
import { usePlayerStore } from '../store/player';
import { MAX_SELECTION, useSelectionStore } from '../store/selection';
import { useToastStore } from '../store/toast';
import { ClipPlayer, type ClipRange } from './ClipPlayer';
import { ContextDrawer } from './ContextDrawer';
import { CheckIcon, ChevronDownIcon, PlayIcon, ReplayIcon } from './icons';
import type { ClipStatus } from '../hooks/useClipPlayer';

interface Props {
  line: SearchItem;
  terms: string[];
  onOpenOverlay: () => void;
  /** discover：整卡点蒙版；search：仅上方画面区点蒙版，底部为操作条 */
  variant: 'discover' | 'search';
}

export function SnippetCard({ line, terms, onOpenOverlay, variant }: Props) {
  const { ready, loading, failed, videoRef } = useVideoPosterFrame(line, true);
  const linesBoth = pickDisplayLines(line, 'both');

  const isOpen = usePlayerStore((s) => s.playingId === line.id);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const [clip, setClip] = useState<ClipRange | null>(null);
  const [status, setStatus] = useState<ClipStatus>('idle');
  const [contextOpen, setContextOpen] = useState(false);
  const selected = useSelectionStore((s) => s.items.some((i) => i.id === line.id));
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const showToast = useToastStore((s) => s.show);
  const [pulse, setPulse] = useState(0);

  const handleToggle = () => {
    if (toggleSelection(line) === 'limit') showToast(`最多选 ${MAX_SELECTION} 条，请先取消一些再选`);
  };

  useEffect(
    () => () => {
      if (usePlayerStore.getState().playingId === line.id) usePlayerStore.getState().setPlaying(null);
    },
    [line.id],
  );

  const startClip = useCallback(
    (range: ClipRange) => {
      setPlaying(line.id);
      setClip({ startMs: range.startMs, endMs: range.endMs });
      setPulse((n) => n + 1);
    },
    [line.id, setPlaying],
  );

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setClip(null);
    setStatus('idle');
  }, [setPlaying]);

  const showPlayer = isOpen && clip !== null;
  const replay = showPlayer && status === 'ended';
  const showVideo = line.hasVideo && !failed && !!ready;

  const openOverlay = () => {
    setContextOpen(false);
    onOpenOverlay();
  };

  const onPictureClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('button, label, input, [role="dialog"]')) return;
    openOverlay();
  };

  const baseCard =
    'flex aspect-[4/5] w-full min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface-muted text-left shadow-soft transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift';
  const selectedRing = selected ? 'border-brand-fg/35 bg-brand-soft/30' : '';
  const playingRing = showPlayer ? 'border-brand-fg/50' : '';

  return (
    <div className={`${baseCard} ${selectedRing} ${playingRing}`}>
      {/* 画面区：点击打开蒙版（search 时底部操作条单独处理点击） */}
      <div
        className="relative min-h-0 flex-1 cursor-pointer overflow-hidden"
        role={variant === 'discover' ? 'button' : undefined}
        tabIndex={variant === 'discover' ? 0 : undefined}
        onClick={variant === 'discover' ? onPictureClick : onPictureClick}
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
        {line.hasVideo && !failed && (
          <video
            ref={videoRef}
            muted
            playsInline
            preload="auto"
            className={`absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${showVideo ? 'opacity-100' : 'opacity-0'}`}
            crossOrigin="anonymous"
            aria-hidden
          />
        )}

        {!showVideo && (
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

        {loading && (
          <span className="absolute right-2 top-2 z-10 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}

        {/* 字幕：九宫格固定中英两行；search 时底部有工具条，字幕整体上移避免被遮挡 */}
        <div
          className={`absolute inset-x-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 ${variant === 'search' ? 'bottom-0 pb-14 pt-10' : 'bottom-0 pb-3 pt-12'}`}
        >
          {linesBoth.map((l) => (
            <p
              key={l.lang}
              lang={l.lang === 'en' ? 'en' : 'zh-CN'}
              className={`text-sm leading-snug drop-shadow-[0_1px_2px_rgb(0_0_0/0.9)] ${
                l.lang === 'zh' ? 'mt-0.5 text-white/88' : 'font-semibold text-white'
              }`}
            >
              <HighlightText text={l.text} terms={terms} />
            </p>
          ))}
        </div>
      </div>

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
              onClick={() => {
                setContextOpen(false);
                openOverlay();
              }}
              className="rounded-pill border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20 sm:text-xs"
            >
              查看片段
            </button>
            <button
              type="button"
              disabled={!line.hasVideo}
              title={line.hasVideo ? undefined : '该集暂无视频'}
              onClick={() => startClip({ startMs: line.startMs, endMs: line.endMs })}
              className="relative inline-flex items-center gap-0.5 rounded-pill bg-brand-gradient px-2.5 py-1 text-[11px] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
            >
              {replay ? <ReplayIcon /> : <PlayIcon />}
              {replay ? '重播' : '播放'}
              {pulse > 0 && (
                <span key={pulse} aria-hidden className="pointer-events-none absolute inset-0 rounded-pill animate-pulse-once" />
              )}
            </button>
            <button
              type="button"
              aria-expanded={contextOpen}
              onClick={() => setContextOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 rounded-pill border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] text-white/95 hover:bg-white/20 sm:text-xs"
            >
              上下文
              <ChevronDownIcon className={`h-3 w-3 transition-transform ${contextOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {contextOpen && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-card border border-white/15 bg-black/80 p-2">
              <ContextDrawer lineId={line.id} mode="both" terms={terms} canPlay={line.hasVideo} onPlay={startClip} />
            </div>
          )}
        </div>
      )}

      {showPlayer && (
        <div className="relative z-20 shrink-0 border-t border-line bg-surface px-1 pb-1 pt-1">
          <ClipPlayer lineId={line.id} clip={clip} onStatusChange={setStatus} onClose={closePlayer} />
        </div>
      )}
    </div>
  );
}
