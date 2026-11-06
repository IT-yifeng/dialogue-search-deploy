// 搜索结果 / 推荐的片段蒙版（手册 §7.2、§7.6）。
import { useEffect } from 'react';
import type { SearchItem } from '../api/types';
import { useVideoPosterFrame } from '../hooks/useVideoPosterFrame';
import { formatSeasonEpisodeLabel } from '../lib/formatTime';
import { pickDisplayLines, type LangMode } from '../lib/displayLines';
import { HighlightText } from './HighlightText';
import { CloseIcon } from './icons';

interface Props {
  open: boolean;
  line: SearchItem | null;
  mode: LangMode;
  terms: string[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  disablePrev: boolean;
  disableNext: boolean;
  /** 完整的分享 URL（含 origin 与 lineId） */
  shareUrl: string;
  onCopyLink: () => void;
}

export function SearchResultOverlay({
  open,
  line,
  mode,
  terms,
  onClose,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
  shareUrl,
  onCopyLink,
}: Props) {
  const { ready, loading, failed, videoRef } = useVideoPosterFrame(line, open);
  const display = line ? pickDisplayLines(line, mode) : [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && !disablePrev) onPrev();
      if (e.key === 'ArrowRight' && !disableNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, onPrev, onNext, disablePrev, disableNext]);

  if (!open || !line) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="片段预览"
      className="fixed inset-0 z-40 flex flex-col bg-black/70 backdrop-blur-sm p-3 sm:p-6"
    >
      <div className="flex min-h-0 w-full max-w-[min(100%,56rem)] flex-1 flex-col overflow-hidden sm:mx-auto sm:my-auto sm:max-h-[92vh] sm:rounded-card sm:shadow-lift lg:max-w-[min(100%,64rem)]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-surface px-4 py-3 sm:rounded-t-card">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-soft"
          >
            <CloseIcon />
            关闭
          </button>
          <button
            type="button"
            onClick={onCopyLink}
            className="rounded-pill bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
          >
            复制链接
          </button>
        </div>

        <div className="relative min-h-[38vh] flex-1 overflow-y-auto bg-ink sm:min-h-[42vh]">
          {/* 用大尺寸 16:9 视频区，避免蒙版过窄；关键帧用 video 元素避免跨域 canvas 截图为空 */}
          <div className="relative aspect-video w-full overflow-hidden bg-[rgb(var(--c-brand-soft))]">
            {line.hasVideo && !failed && (
              <video
                ref={videoRef}
                muted
                playsInline
                preload="auto"
                className={`absolute inset-0 h-full w-full object-contain ${ready ? 'opacity-100' : 'opacity-0'}`}
                crossOrigin="anonymous"
                aria-hidden
              />
            )}
            <span className="absolute left-3 top-3 z-10 rounded-pill bg-black/55 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
              {formatSeasonEpisodeLabel(line.episode.season, line.episode.episode)}
            </span>
            {loading && (
              <span className="absolute right-3 top-3 z-10 h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
          </div>

          <div className="border-t border-white/10 bg-gradient-to-b from-black/80 to-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            {display.map((l) => (
              <p
                key={l.lang}
                lang={l.lang === 'en' ? 'en' : 'zh-CN'}
                className={`text-base leading-relaxed text-white drop-shadow-md ${
                  mode === 'both' && l.lang === 'zh' ? 'mt-1 text-white/85' : 'font-semibold'
                }`}
              >
                <HighlightText text={l.text} terms={terms} />
              </p>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-surface px-4 py-3 sm:rounded-b-card">
          <button
            type="button"
            disabled={disablePrev}
            onClick={onPrev}
            className="flex-1 rounded-control border border-line bg-surface py-2.5 text-sm font-semibold text-ink transition enabled:active:scale-[0.98] enabled:hover:border-brand-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一条
          </button>
          <button
            type="button"
            disabled={disableNext}
            onClick={onNext}
            className="flex-1 rounded-control border border-line bg-surface py-2.5 text-sm font-semibold text-ink transition enabled:active:scale-[0.98] enabled:hover:border-brand-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一条
          </button>
        </div>
      </div>

      {/* 供调试 / 辅助技术：链接可读性 */}
      <span className="sr-only">{shareUrl}</span>
    </div>
  );
}
