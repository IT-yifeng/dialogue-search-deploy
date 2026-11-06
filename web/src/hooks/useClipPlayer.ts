// 片段播放控制：用整集视频 + 起止时间播放，不需要提前切片（手册 §3.3、§4.5）。
//
// 几个关键决定：
// 1. 到点暂停用 requestAnimationFrame 轮询，而不是只靠 timeupdate——
//    timeupdate 约 250ms 才触发一次，会播过头，难以满足“误差 ≤ 0.3s”。
//    标签页在后台时 rAF 会被浏览器暂停，所以保留 timeupdate 作兜底。
// 2. 用户手动拖动进度条后立刻取消“到点暂停”，变成自由播放：
//    否则拖到片段外会被强行暂停或拉回，体验像“卡住”。
// 3. 状态只在“切换”时更新，不在每一帧 setState，拖动和播放才不会掉帧。
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { clipWindow } from '../lib/clipWindow';

export type ClipStatus =
  | 'idle' // 还没开始播
  | 'loading' // 正在跳转 / 缓冲
  | 'playing'
  | 'paused' // 用户手动暂停，或浏览器拦截了自动播放
  | 'ended' // 播到片段结束时间，自动暂停；界面上显示“重播”
  | 'error';

interface Options {
  /** 视频加载或播放出错（如预签名链接过期返回 403）；由调用方决定是否重新取链接 */
  onSourceError?: () => void;
}

/** 判断一次 seeking 是不是我们自己发起的：位置与目标足够接近就算 */
const OWN_SEEK_TOLERANCE_SEC = 0.1;

export function useClipPlayer(videoRef: RefObject<HTMLVideoElement>, options: Options = {}) {
  const [status, setStatusState] = useState<ClipStatus>('idle');
  // 事件回调里要读“最新状态”，用 ref 同步一份，避免闭包拿到旧值
  const statusRef = useRef<ClipStatus>('idle');
  // 到点暂停的位置（秒）；null 表示未启用（尚未播放，或用户拖动后已取消）
  const stopAtRef = useRef<number | null>(null);
  // 我们自己发起的 seek 的目标位置，用来和用户拖动区分
  const ownSeekRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onSourceErrorRef = useRef(options.onSourceError);
  onSourceErrorRef.current = options.onSourceError;

  const setStatus = useCallback((next: ClipStatus) => {
    if (statusRef.current === next) return;
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const cancelLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** 到达片段结束：先改状态再暂停，这样 pause 事件处理里不会把 ended 覆盖成 paused */
  const finish = useCallback(() => {
    stopAtRef.current = null;
    cancelLoop();
    setStatus('ended');
    videoRef.current?.pause();
  }, [cancelLoop, setStatus, videoRef]);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const tick = () => {
      rafRef.current = null;
      const video = videoRef.current;
      const stopAt = stopAtRef.current;
      if (!video || stopAt === null) return;
      if (video.currentTime >= stopAt) {
        finish();
        return;
      }
      // 暂停时不再轮询；恢复播放时由 playing 事件重新启动
      if (!video.paused) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [finish, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => {
      setStatus('playing');
      if (stopAtRef.current !== null) startLoop();
    };
    const onWaiting = () => {
      // 缓冲中；暂停状态下的 waiting 不用管
      if (!video.paused && stopAtRef.current !== null) setStatus('loading');
    };
    const onPause = () => {
      // ended / error 是更具体的原因，不能被覆盖
      if (statusRef.current === 'playing' || statusRef.current === 'loading') setStatus('paused');
      cancelLoop();
    };
    const onTimeUpdate = () => {
      const stopAt = stopAtRef.current;
      if (stopAt !== null && video.currentTime >= stopAt) finish();
    };
    const onEnded = () => {
      // 整集视频播到了尽头（台词在片尾）：同样算片段结束
      if (stopAtRef.current !== null) finish();
    };
    const onSeeking = () => {
      const own = ownSeekRef.current;
      if (own !== null && Math.abs(video.currentTime - own) < OWN_SEEK_TOLERANCE_SEC) return;
      // 用户自己拖动：取消到点暂停，之后随便看
      stopAtRef.current = null;
      ownSeekRef.current = null;
      cancelLoop();
    };
    const onSeeked = () => {
      ownSeekRef.current = null;
    };
    const onError = () => {
      stopAtRef.current = null;
      cancelLoop();
      setStatus('error');
      onSourceErrorRef.current?.();
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      cancelLoop();
    };
  }, [videoRef, setStatus, startLoop, cancelLoop, finish]);

  /** 播放 [startMs, endMs] 这一句；重复调用即“重播”，也用于从上下文里的另一句开始播 */
  const playClip = useCallback(
    async (startMs: number, endMs: number) => {
      const video = videoRef.current;
      if (!video) return;
      const { seekTo, stopAt } = clipWindow(startMs, endMs);

      cancelLoop();
      stopAtRef.current = stopAt;
      ownSeekRef.current = null;
      setStatus('loading');

      // 刚换源时元数据还没到：此时设置 currentTime 在部分浏览器（如 Safari）会被忽略，
      // 结果从片头开始播。所以先等 loadedmetadata；出错也要放行，错误由 error 事件处理
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        const ctl = new AbortController();
        await new Promise<void>((resolve) => {
          const done = () => {
            ctl.abort();
            resolve();
          };
          video.addEventListener('loadedmetadata', done, { once: true, signal: ctl.signal });
          video.addEventListener('error', done, { once: true, signal: ctl.signal });
        });
        // 等待期间又有新的 playClip（连点、换句）时，以最新那次为准，这次放弃
        if (stopAtRef.current !== stopAt || statusRef.current === 'error') return;
      }

      ownSeekRef.current = seekTo;
      video.currentTime = seekTo;
      try {
        await video.play();
      } catch (err) {
        // AbortError：播放请求被后来的 play()/load() 打断（连点、换源），新请求会接管状态
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // 其余（多为浏览器拦截自动播放）：保留到点暂停，用户点原生播放键后照常生效
        if (statusRef.current === 'loading') setStatus('paused');
      }
    },
    [cancelLoop, setStatus, videoRef],
  );

  return { status, playClip };
}
