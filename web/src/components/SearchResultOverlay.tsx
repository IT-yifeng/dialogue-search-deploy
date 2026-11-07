// 搜索结果 / 推荐的片段蒙版（手册 §7.2、§7.6）：打开即播；双语字幕悬浮在画面底部居中。
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchContext, fetchLine } from '../api/lines';
import type { SearchItem } from '../api/types';
import { contextClipRange } from '../lib/contextClip';
import { isContextMergedClip, lineAtTimeMs } from '../lib/lineAtTime';
import { formatSeasonEpisodeLabel } from '../lib/formatTime';
import { ClipPlayer, type ClipPlayerHandle, type ClipRange } from './ClipPlayer';
import { ContextDrawer } from './ContextDrawer';
import { FrameExportDialog } from './FrameExportDialog';
import { VideoSubtitleOverlay } from './VideoSubtitleOverlay';
import { CameraIcon, CloseIcon } from './icons';

interface Props {
  open: boolean;
  line: SearchItem | null;
  terms: string[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  disablePrev: boolean;
  disableNext: boolean;
  shareUrl: string;
  onCopyLink: () => void;
  /** 从搜索卡「上下文」进入：默认播前后句合并片段并展开列表 */
  contextOpen: boolean;
  onFocusLineId: (id: number) => void;
}

export function SearchResultOverlay({
  open,
  line,
  terms,
  onClose,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
  shareUrl,
  onCopyLink,
  contextOpen,
  onFocusLineId,
}: Props) {
  const [overrideLine, setOverrideLine] = useState<SearchItem | null>(null);
  const [clipOverride, setClipOverride] = useState<ClipRange | null>(null);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const playerRef = useRef<ClipPlayerHandle>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTimeMs, setExportTimeMs] = useState(0);
  const [exportPlayUrl, setExportPlayUrl] = useState<string | null>(null);
  const [exportSourceVideo, setExportSourceVideo] = useState<HTMLVideoElement | null>(null);
  const [exportSubtitles, setExportSubtitles] = useState({ en: '', zh: '' });

  const ctxQuery = useQuery({
    queryKey: ['context', line?.id, 'overlay'],
    queryFn: ({ signal }) => fetchContext(line!.id, signal),
    enabled: open && contextOpen && line !== null,
    staleTime: 5 * 60 * 1000,
  });

  const activeLine = overrideLine ?? line;

  const clip = useMemo<ClipRange | null>(() => {
    if (!activeLine) return null;
    if (clipOverride) return clipOverride;
    if (contextOpen && ctxQuery.data) return contextClipRange(ctxQuery.data.lines);
    return { startMs: activeLine.startMs, endMs: activeLine.endMs };
  }, [activeLine, clipOverride, contextOpen, ctxQuery.data]);

  useEffect(() => {
    setOverrideLine(null);
    setClipOverride(null);
    setPlayheadMs(null);
    setExportOpen(false);
    setExportPlayUrl(null);
    setExportSourceVideo(null);
  }, [line?.id]);

  useEffect(() => {
    if (!open) {
      setOverrideLine(null);
      setClipOverride(null);
      setPlayheadMs(null);
      setExportOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setPlayheadMs(null);
  }, [clip?.startMs, clip?.endMs, activeLine?.id]);

  const syncContextSubtitles = Boolean(
    contextOpen && ctxQuery.data && clip && isContextMergedClip(clip, ctxQuery.data.lines),
  );

  const subtitleLine = useMemo(() => {
    if (!activeLine) return { en: '', zh: '' };
    if (syncContextSubtitles && ctxQuery.data) {
      const t = playheadMs ?? activeLine.startMs;
      const at = lineAtTimeMs(ctxQuery.data.lines, t);
      if (at) return { en: at.en, zh: at.zh };
    }
    return { en: activeLine.en, zh: activeLine.zh };
  }, [syncContextSubtitles, ctxQuery.data, playheadMs, activeLine]);

  const playingContextLineId = useMemo(() => {
    if (!activeLine || !syncContextSubtitles || !ctxQuery.data) return undefined;
    const t = playheadMs ?? activeLine.startMs;
    return lineAtTimeMs(ctxQuery.data.lines, t)?.id;
  }, [syncContextSubtitles, ctxQuery.data, playheadMs, activeLine]);

  const contextLineId = line?.id;

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

  const onContextPlay = (lineId: number, range: ClipRange) => {
    void (async () => {
      const base = overrideLine ?? line;
      const fetched =
        base && lineId === base.id ? base : lineId === line?.id && line ? line : await fetchLine(lineId, new AbortController().signal);
      setOverrideLine(fetched);
      setClipOverride(range);
      onFocusLineId(lineId);
    })();
  };

  const waitingContext = contextOpen && (ctxQuery.isPending || !ctxQuery.data);
  const showVideo = activeLine?.hasVideo && clip && !waitingContext;

  const openFrameExport = () => {
    const video = playerRef.current?.getVideo();
    let t = playheadMs;
    if (video && Number.isFinite(video.currentTime)) {
      t = Math.round(video.currentTime * 1000);
    }
    if (t == null && activeLine) t = activeLine.startMs;
    const playUrl = playerRef.current?.getPlayUrl() ?? video?.currentSrc ?? video?.src ?? null;
    if (!playUrl) return;
    setExportTimeMs(t ?? 0);
    setExportPlayUrl(playUrl);
    setExportSourceVideo(video ?? null);
    setExportSubtitles({ en: subtitleLine.en, zh: subtitleLine.zh });
    setExportOpen(true);
  };

  if (!open || !line || !activeLine) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="片段预览"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="flex max-h-[100dvh] w-full max-w-[min(100%,42rem)] flex-col overflow-hidden bg-surface shadow-lift sm:max-h-[min(92dvh,40rem)] sm:rounded-card">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-brand-soft"
          >
            <CloseIcon />
            关闭
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {showVideo && (
              <button
                type="button"
                onClick={openFrameExport}
                className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink transition hover:border-brand-fg active:scale-[0.98] sm:px-3 sm:py-2"
              >
                <CameraIcon />
                截图
              </button>
            )}
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-pill bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] sm:px-4 sm:py-2"
            >
              复制链接
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          <div className="relative w-full bg-black">
            <span className="absolute left-2 top-2 z-20 rounded-pill bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white sm:left-3 sm:top-3 sm:px-2.5 sm:text-xs">
              {formatSeasonEpisodeLabel(activeLine.episode.season, activeLine.episode.episode)}
            </span>

            {waitingContext ? (
              <div className="flex aspect-video w-full items-center justify-center text-sm text-white/80">加载上下文…</div>
            ) : showVideo ? (
              <div className="w-full">
                <ClipPlayer
                  ref={playerRef}
                  key={`${activeLine.id}-${clip!.startMs}-${clip!.endMs}`}
                  lineId={activeLine.id}
                  clip={clip!}
                  embedded
                  onPlaybackTime={syncContextSubtitles ? setPlayheadMs : undefined}
                >
                  <VideoSubtitleOverlay line={subtitleLine} terms={terms} />
                </ClipPlayer>
              </div>
            ) : (
              <div className="relative aspect-video w-full">
                <div className="flex h-full w-full items-center justify-center bg-[rgb(var(--c-brand-soft))] text-sm text-ink-sub">
                  该集暂无视频
                </div>
                <VideoSubtitleOverlay line={subtitleLine} terms={terms} />
              </div>
            )}
          </div>

          {contextOpen && contextLineId !== undefined && (
            <div className="max-h-[min(34vh,16rem)] overflow-y-auto border-t border-line px-3 py-2 sm:px-4">
              <ContextDrawer
                lineId={contextLineId}
                mode="both"
                terms={terms}
                canPlay={activeLine.hasVideo}
                playingLineId={playingContextLineId}
                onPlay={onContextPlay}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:px-4 sm:py-3 sm:rounded-b-card">
          <button
            type="button"
            disabled={disablePrev}
            onClick={onPrev}
            className="flex-1 rounded-control border border-line bg-surface py-2 text-sm font-semibold text-ink transition enabled:active:scale-[0.98] enabled:hover:border-brand-fg disabled:cursor-not-allowed disabled:opacity-40 sm:py-2.5"
          >
            上一条
          </button>
          <button
            type="button"
            disabled={disableNext}
            onClick={onNext}
            className="flex-1 rounded-control border border-line bg-surface py-2 text-sm font-semibold text-ink transition enabled:active:scale-[0.98] enabled:hover:border-brand-fg disabled:cursor-not-allowed disabled:opacity-40 sm:py-2.5"
          >
            下一条
          </button>
        </div>
      </div>

      <span className="sr-only">{shareUrl}</span>

      <FrameExportDialog
        open={exportOpen}
        playUrl={exportPlayUrl}
        sourceVideo={exportSourceVideo}
        line={activeLine}
        subtitles={exportSubtitles}
        timeMs={exportTimeMs}
        onClose={() => {
          setExportOpen(false);
          setExportPlayUrl(null);
          setExportSourceVideo(null);
        }}
      />
    </div>
  );
}
