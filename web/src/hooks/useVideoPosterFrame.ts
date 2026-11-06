// §7.9：片段「关键帧」展示。
// R2 预签名 URL 跨域时 canvas 会污染，无法用 toDataURL；卡片与蒙版统一用可见的 <video> + currentTime 定位到中点。
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { fetchPlay } from '../api/lines';
import { shouldRetry } from '../api/client';
import type { SearchItem } from '../api/types';

const PLAY_STALE_MS = 50 * 60 * 1000;

function midpointSec(line: SearchItem): number {
  return (line.startMs + line.endMs) / 2000;
}

export interface VideoPosterFrameResult {
  /** 已拿到元数据并成功 seek，画面可用于展示 */
  ready: boolean;
  /** 仍在拉 play 或等待 seeked */
  loading: boolean;
  /** 无视频、接口失败或播放错误时为 true，由调用方降级为纯色底 */
  failed: boolean;
  videoRef: RefObject<HTMLVideoElement>;
}

/**
 * 挂载一个（通常叠在卡片/蒙版里）`<video ref={videoRef} />`，在台词中点显示静帧。
 * **不要**设置 `crossOrigin = 'anonymous'`：预签名 URL 跨域加载时，若存储未回 `Access-Control-Allow-Origin`，
 * 带 CORS 的视频请求会整段失败（error），画面永远出不来；静帧展示不读像素，不需要 CORS。
 */
export function useVideoPosterFrame(line: SearchItem | null, enabled: boolean): VideoPosterFrameResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const play = useQuery({
    queryKey: ['play', line?.id],
    queryFn: ({ signal }) => fetchPlay(line!.id, signal),
    enabled: enabled && line !== null && line.hasVideo,
    staleTime: PLAY_STALE_MS,
    retry: shouldRetry,
  });

  const url = play.data?.url;

  useEffect(() => {
    setReady(false);
    setFailed(false);
    if (!line?.hasVideo || !enabled) {
      if (!line?.hasVideo) setFailed(true);
      return;
    }
    if (!url) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const rawTarget = midpointSec(line);

    const onError = () => {
      if (!cancelled) {
        setFailed(true);
        setReady(false);
      }
    };

    /** 有的浏览器在仅有 loadedmetadata 时 seek 不落帧；seeked 也可能晚到。用多事件 + 超时兜底。 */
    const tryMarkReady = () => {
      if (cancelled) return;
      if (video.videoWidth >= 2 && video.videoHeight >= 2) setReady(true);
    };

    const onSeeked = () => tryMarkReady();

    const onTimeUpdate = () => {
      if (cancelled) return;
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const lo = Math.min(rawTarget, Math.max(0, d - 0.05));
      if (Math.abs(video.currentTime - lo) < 0.25) tryMarkReady();
    };

    const seekToTarget = () => {
      if (cancelled) return;
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const t = Math.min(Math.max(0, rawTarget), Math.max(0, d - 0.05));
      try {
        video.currentTime = t;
      } catch {
        if (!cancelled) {
          setFailed(true);
          setReady(false);
        }
      }
    };

    const onLoadedMeta = () => {
      seekToTarget();
    };

    const onLoadedData = () => {
      seekToTarget();
      tryMarkReady();
    };

    const onCanPlay = () => {
      seekToTarget();
    };

    video.pause();
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // 不显式设 crossOrigin：否则对象存储未配 CORS 时整段加载失败（表现为始终无画面）
    video.removeAttribute('crossorigin');
    video.src = url;
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onError);
    video.addEventListener('loadedmetadata', onLoadedMeta);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);

    const stallTimer = window.setTimeout(() => {
      if (cancelled) return;
      tryMarkReady();
    }, 4000);

    void video.load();

    return () => {
      cancelled = true;
      window.clearTimeout(stallTimer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onError);
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [line, enabled, url]);

  useEffect(() => {
    if (play.isError) setFailed(true);
  }, [play.isError]);

  const loading =
    enabled &&
    line?.hasVideo === true &&
    !failed &&
    (play.isPending || (!!url && !ready));

  return { ready, loading, failed: failed || line?.hasVideo === false, videoRef };
}
