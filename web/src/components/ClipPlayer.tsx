import { useQuery } from '@tanstack/react-query';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { fetchPlay } from '../api/lines';
import type { PlayResponse } from '../api/types';
import { ApiError, shouldRetry } from '../api/client';
import { formatApiErrorMessage } from '../lib/errorMessage';
import { trackEngagement } from '../lib/trackEngagement';
import { useClipPlayer, type ClipStatus } from '../hooks/useClipPlayer';

export interface ClipRange {
  startMs: number;
  endMs: number;
}

/**
 * 播放信息的来源。搜索页走默认的 /api/lines/:id/play；
 * 分享页免口令，必须改走 /api/shares/:id/lines/:lineId/play，由调用方传入。
 */
export interface PlaySource {
  /** TanStack Query 的缓存键，不同来源要区分开，免得互相读到对方的缓存 */
  queryKey: readonly unknown[];
  fetch: (signal: AbortSignal) => Promise<PlayResponse>;
}

export interface ClipPlayerHandle {
  getVideo: () => HTMLVideoElement | null;
  /** 当前播放地址，供 M8 离屏 crossOrigin 加载 */
  getPlayUrl: () => string | null;
}

interface Props {
  lineId: number;
  /** 不传则使用搜索页的默认来源 */
  source?: PlaySource;
  /**
   * 当前要播的区间。每次传入新对象（哪怕数值相同）都会重新播放，
   * 所以“重播”和“从上下文里的另一句开始”都靠换一个新对象触发。
   */
  clip: ClipRange;
  onStatusChange?: (status: ClipStatus) => void;
  onClose?: () => void;
  /** 蒙版内嵌：只保留 16:9 视频区，无收起按钮 */
  embedded?: boolean;
  /** 播放头变化（毫秒），供上下文合并播放时同步字幕 */
  onPlaybackTime?: (timeMs: number) => void;
  /** 叠在 16:9 画面上（如双语字幕），须用 absolute 定位 */
  children?: ReactNode;
}

// 播放链接有效期 1 小时，缓存 50 分钟：同一集连续播多句不用反复签发，又留出余量不会拿到刚过期的链接
const PLAY_STALE_MS = 50 * 60 * 1000;

export const ClipPlayer = forwardRef<ClipPlayerHandle, Props>(function ClipPlayer(
  {
    lineId,
    source,
    clip,
    onStatusChange,
    onClose,
    embedded,
    onPlaybackTime,
    children,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // 自动重试只做一次：链接过期（403）重新取一次即可；再失败多半是文件本身有问题，交给用户手动重试
  const retriedRef = useRef(false);
  const playTrackedRef = useRef(false);
  const [gaveUp, setGaveUp] = useState(false);
  // 同一个 URL（本地开发时链接不变）重试也需要重新加载，用计数触发
  const [reloadToken, setReloadToken] = useState(0);

  const play = useQuery({
    queryKey: source?.queryKey ?? ['play', lineId],
    queryFn: ({ signal }) => (source ? source.fetch(signal) : fetchPlay(lineId, signal)),
    staleTime: PLAY_STALE_MS,
    retry: shouldRetry,
  });
  const url = play.data?.url;

  useImperativeHandle(
    ref,
    () => ({
      getVideo: () => videoRef.current,
      getPlayUrl: () => {
        const v = videoRef.current;
        const fromEl = v?.currentSrc || v?.src;
        if (fromEl) return fromEl;
        return url ?? null;
      },
    }),
    [url],
  );

  const reloadSource = useCallback(async () => {
    const res = await play.refetch();
    if (res.data) setReloadToken((t) => t + 1);
    else setGaveUp(true);
  }, [play]);

  const { status, playClip } = useClipPlayer(videoRef, {
    onSourceError: () => {
      if (retriedRef.current) {
        setGaveUp(true);
        return;
      }
      retriedRef.current = true;
      void reloadSource();
    },
  });

  useEffect(() => {
    onStatusChange?.(status);
    // 真正播起来说明链接可用，之后再过期仍然值得再自动重试一次
    if (status === 'playing') {
      retriedRef.current = false;
      if (!playTrackedRef.current) {
        playTrackedRef.current = true;
        trackEngagement({ kind: 'play', lineId });
      }
    }
  }, [status, onStatusChange, lineId]);

  // 卸载时释放视频：只 pause 不够，浏览器会继续缓冲；清掉 src 并 load() 才会断开连接。
  // 同时重置 loadedRef，这样 StrictMode 下“模拟卸载再挂载”也会重新设置 src。
  const loadedRef = useRef<{ url: string; token: number } | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      loadedRef.current = null;
      if (!video) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  // 拿到链接 → 设置视频源并播放；clip 变了 → 只跳转重播，不重新加载
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    const loaded = loadedRef.current;
    if (!loaded || loaded.url !== url || loaded.token !== reloadToken) {
      video.src = url;
      video.load();
      loadedRef.current = { url, token: reloadToken };
    }
    setGaveUp(false);
    void playClip(clip.startMs, clip.endMs);
  }, [url, reloadToken, clip, playClip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onPlaybackTime) return;
    const emit = () => {
      if (Number.isFinite(video.currentTime)) onPlaybackTime(video.currentTime * 1000);
    };
    video.addEventListener('timeupdate', emit);
    video.addEventListener('seeked', emit);
    return () => {
      video.removeEventListener('timeupdate', emit);
      video.removeEventListener('seeked', emit);
    };
  }, [onPlaybackTime, url]);

  const handleManualRetry = () => {
    retriedRef.current = false;
    setGaveUp(false);
    void reloadSource();
  };

  const noVideo = play.error instanceof ApiError && play.error.code === 'NO_VIDEO';
  const showError = play.isError || gaveUp;
  // 已有播放地址后交给 <video> 自带缓冲指示，避免整屏「加载中」盖住画面
  const showLoading = !showError && play.isPending;

  const videoBlock = (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-black ${
        embedded ? 'h-full rounded-none' : 'rounded-card shadow-soft ring-1 ring-line'
      }`}
    >
      {/* 不设 crossOrigin：R2 未配 CORS 时仍可播放；M8 导出用离屏 video（§7.9） */}
      <video ref={videoRef} controls playsInline preload="metadata" className="h-full w-full" />
      {children}
      {showLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white backdrop-blur-[2px]">
          加载中…
        </div>
      )}
    </div>
  );

  const errorBlock = showError && (
    <div
      role="alert"
      className={`flex items-center justify-between gap-3 text-sm text-danger ${
        embedded
          ? 'bg-danger-soft/90 px-4 py-2'
          : 'rounded-card border border-danger/30 bg-danger-soft px-4 py-2'
      }`}
    >
      <span>
        {noVideo
          ? '该集暂无视频'
          : play.error
            ? formatApiErrorMessage(play.error, '视频加载失败')
            : '视频加载失败'}
      </span>
      {!noVideo && (
        <button
          type="button"
          onClick={handleManualRetry}
          className="shrink-0 rounded-pill border border-danger/40 bg-surface px-3.5 py-1 font-medium transition hover:bg-danger-soft active:scale-[0.98]"
        >
          重试
        </button>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {videoBlock}
        {errorBlock}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {videoBlock}
      {errorBlock}
      {onClose && (
        <div className="text-right">
          <button type="button" onClick={onClose} className="rounded-pill px-2 py-1 text-meta text-ink-sub transition hover:text-brand-fg">
            收起播放器
          </button>
        </div>
      )}
    </div>
  );
});
