// 片段底图：优先用 API 下发的 thumbnailUrl（管线截帧 + R2）；失败或无图时回退到 <video> seek（§7.9）。
import { useCallback, useEffect, useState } from 'react';
import type { SearchItem } from '../api/types';
import { useVideoPosterFrame } from './useVideoPosterFrame';

export interface LinePosterResult {
  /** 使用静态缩略图（成功加载前仍为 false） */
  useImage: boolean;
  thumbnailUrl: string | null;
  /** 绑到缩略图 <img> 上 */
  onThumbLoad: () => void;
  onThumbError: () => void;
  imageLoaded: boolean;
  imageFailed: boolean;
  /** 与 useVideoPosterFrame 一致；仅在不使用图片或图片失败时启用 */
  ready: boolean;
  loading: boolean;
  failed: boolean;
  videoRef: ReturnType<typeof useVideoPosterFrame>['videoRef'];
}

export function useLinePoster(line: SearchItem | null, enabled: boolean): LinePosterResult {
  const thumb = line?.thumbnailUrl?.trim() ? line.thumbnailUrl : null;
  const wantImage = enabled && !!line?.hasVideo && !!thumb;

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgLoaded(false);
    setImgFailed(false);
  }, [line?.id, thumb]);

  const onThumbLoad = useCallback(() => setImgLoaded(true), []);
  const onThumbError = useCallback(() => setImgFailed(true), []);

  const useVideoFallback = !wantImage || imgFailed;
  const v = useVideoPosterFrame(line, enabled && useVideoFallback);

  const showThumb = wantImage && !imgFailed;
  return {
    useImage: showThumb,
    thumbnailUrl: thumb,
    onThumbLoad,
    onThumbError,
    imageLoaded: imgLoaded,
    imageFailed: imgFailed,
    ready: showThumb ? imgLoaded : v.ready,
    loading: showThumb ? !imgLoaded : v.loading,
    failed: showThumb ? false : v.failed,
    videoRef: v.videoRef,
  };
}
