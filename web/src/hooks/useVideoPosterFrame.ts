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
 * 挂载一个（通常 `opacity-0` 或 `absolute inset-0`）`<video ref={videoRef} />`，
 * 在台词中点显示静帧；不截图，故不受跨域画布污染限制。
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
    const target = midpointSec(line);

    const onSeeked = () => {
      if (!cancelled) setReady(true);
    };

    const onError = () => {
      if (!cancelled) {
        setFailed(true);
        setReady(false);
      }
    };

    video.pause();
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = url;
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    const onLoadedMeta = () => {
      if (cancelled) return;
      try {
        video.currentTime = target;
      } catch {
        if (!cancelled) {
          setFailed(true);
          setReady(false);
        }
      }
    };

    video.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
    void video.load();

    return () => {
      cancelled = true;
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
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
