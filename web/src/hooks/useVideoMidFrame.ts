// §7.9：台词中点截取一帧作为卡片底图（隐藏 video + canvas）。
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { fetchPlay } from '../api/lines';
import { shouldRetry } from '../api/client';
import type { SearchItem } from '../api/types';
import { getCachedFrame, setCachedFrame } from '../lib/frameCache';

const PLAY_STALE_MS = 50 * 60 * 1000;

function midpointSec(line: SearchItem): number {
  return (line.startMs + line.endMs) / 2000;
}

export interface VideoMidFrameResult {
  dataUrl: string | null;
  /** 仍在拉播放信息或尚未截到图 */
  loading: boolean;
  videoRef: RefObject<HTMLVideoElement>;
}

/**
 * 需在组件内挂载隐藏的 `<video ref={videoRef} … />`。
 */
export function useVideoMidFrame(line: SearchItem | null, enabled: boolean): VideoMidFrameResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const hasCached = useMemo(() => (line?.id ? getCachedFrame(line.id) !== null : false), [line?.id]);

  const play = useQuery({
    queryKey: ['play', line?.id],
    queryFn: ({ signal }) => fetchPlay(line!.id, signal),
    enabled: enabled && line !== null && line.hasVideo && !hasCached,
    staleTime: PLAY_STALE_MS,
    retry: shouldRetry,
  });
  const url = play.data?.url;

  useEffect(() => {
    if (!line?.id) {
      setDataUrl(null);
      return;
    }
    const fromCache = getCachedFrame(line.id);
    if (fromCache) {
      setDataUrl(fromCache);
      return;
    }
    setDataUrl(null);
    if (!enabled || !line?.hasVideo || !url) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const target = midpointSec(line);

    const capture = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w < 2 || h < 2) return;
        const canvas = document.createElement('canvas');
        const maxW = 480;
        const scale = w > maxW ? maxW / w : 1;
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const jpeg = canvas.toDataURL('image/jpeg', 0.72);
        if (!cancelled) {
          setDataUrl(jpeg);
          if (line) setCachedFrame(line.id, jpeg);
        }
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    };

    const onSeeked = () => {
      requestAnimationFrame(() => {
        if (!cancelled) capture();
      });
    };

    const onLoadedMeta = () => {
      if (cancelled) return;
      try {
        video.currentTime = target;
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    };

    video.pause();
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
    video.addEventListener('error', () => !cancelled && setDataUrl(null), { once: true });
    void video.load();

    return () => {
      cancelled = true;
      video.removeEventListener('seeked', onSeeked);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [line, enabled, url]);

  const loading = enabled && line?.hasVideo === true && !hasCached && (play.isPending || (!!url && dataUrl === null));

  return { dataUrl, loading, videoRef };
}
