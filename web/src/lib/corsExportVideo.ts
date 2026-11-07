// M8：为截图准备可读像素的 video。跨域（R2）须 crossOrigin；同源 /media 不能设，否则无 CORS 头会加载失败。

import { FrameExportError } from './frameExport';

const SEEK_TIMEOUT_MS = 12_000;

export function isSameOriginPlayUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

function normalizePlayUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

function videoMatchesUrl(video: HTMLVideoElement, url: string): boolean {
  const target = normalizePlayUrl(url);
  const cur = video.currentSrc || video.src;
  if (!cur) return false;
  return normalizePlayUrl(cur) === target;
}

function seekVideoTo(video: HTMLVideoElement, timeMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new FrameExportError('NOT_READY', '已取消'));
      return;
    }

    const targetSec = Math.max(0, timeMs / 1000);
    let done = false;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      fn();
    };

    const onSeeked = () => finish(() => resolve());
    const onError = () => finish(() => reject(new FrameExportError('NOT_READY', '无法定位到截图时刻')));

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => finish(() => reject(new FrameExportError('NOT_READY', '已取消')));

    const timer = setTimeout(() => {
      finish(() => reject(new FrameExportError('NOT_READY', '定位截图时刻超时，请重试')));
    }, SEEK_TIMEOUT_MS);

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);

    if (video.readyState < 2) {
      const onReady = () => {
        video.removeEventListener('loadeddata', onReady);
        video.currentTime = targetSec;
        if (Math.abs(video.currentTime - targetSec) < 0.05) finish(() => resolve());
      };
      video.addEventListener('loadeddata', onReady);
      return;
    }

    video.currentTime = targetSec;
    if (Math.abs(video.currentTime - targetSec) < 0.05 && video.videoWidth > 0) {
      finish(() => resolve());
    }
  });
}

export interface ExportVideoHandle {
  video: HTMLVideoElement;
  /** true 表示离屏创建，关闭对话框时要 dispose */
  owned: boolean;
}

/**
 * 离屏或复用主播放器 video，seek 到指定时刻后可供 canvas 读取。
 */
export async function loadExportVideoFrame(
  url: string,
  timeMs: number,
  opts?: { sourceVideo?: HTMLVideoElement | null; signal?: AbortSignal },
): Promise<ExportVideoHandle> {
  const signal = opts?.signal;
  if (signal?.aborted) throw new FrameExportError('NOT_READY', '已取消');

  const sameOrigin = isSameOriginPlayUrl(url);
  const source = opts?.sourceVideo;

  if (sameOrigin && source && videoMatchesUrl(source, url) && source.readyState >= 2 && source.videoWidth > 0) {
    await seekVideoTo(source, timeMs, signal);
    return { video: source, owned: false };
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    // 仅跨域预签名须 anonymous；同源 /media 设了反而触发 CORS 校验且本地路由无 ACAO
    if (!sameOrigin) video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      fn();
    };

    const fail = (message: string) => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      finish(() => reject(new FrameExportError('NOT_READY', message)));
    };

    const succeed = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        fail('视频画面尚未就绪，请稍后再试');
        return;
      }
      finish(() => resolve({ video, owned: true }));
    };

    const targetSec = Math.max(0, timeMs / 1000);

    const onSeeked = () => succeed();

    const onLoaded = () => {
      video.currentTime = targetSec;
      if (Math.abs(video.currentTime - targetSec) < 0.05 && video.readyState >= 2) {
        succeed();
      }
    };

    const onError = () => {
      fail(
        sameOrigin
          ? '无法加载本地视频文件，请确认 work/mp4 已有对应集且已重启后端（STORAGE_DRIVER=local）'
          : '无法为截图加载视频。若使用 R2，请为桶配置 CORS 并允许本站 GET（见 docs/DEPLOY.md）；播放不依赖 CORS。',
      );
    };

    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => fail('已取消');

    const timer = setTimeout(() => fail('加载截图画面超时，请重试'), SEEK_TIMEOUT_MS);

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);

    video.src = url;
    video.load();
  });
}

export function disposeExportVideo(handle: ExportVideoHandle | null): void {
  if (!handle?.owned) return;
  const video = handle.video;
  video.pause();
  video.removeAttribute('src');
  video.load();
}
