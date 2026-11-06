import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSharePlay } from '../api/shares';
import type { SearchItem } from '../api/types';
import type { ClipStatus } from '../hooks/useClipPlayer';
import { SERIES_TITLE } from '../lib/copyText';
import { pickDisplayLines, pickEpisodeTitle, type LangMode } from '../lib/displayLines';
import { formatEpisodeCode, formatTime } from '../lib/formatTime';
import { usePlayerStore } from '../store/player';
import { ClipPlayer, type ClipRange, type PlaySource } from './ClipPlayer';
import { PlayIcon, ReplayIcon } from './icons';

interface Props {
  shareId: string;
  line: SearchItem;
  mode: LangMode;
}

/**
 * 分享页的只读台词卡：出处 + 台词 + 播放。
 * 没有勾选、上下文、高亮——分享页是“回流页”，只负责把几句话和对应片段展示清楚。
 * 不复用 ResultCard 是为了不让搜索页的卡片塞进一堆 “是否分享页” 的分支。
 */
export function ShareLineCard({ shareId, line, mode }: Props) {
  const displayLines = pickDisplayLines(line, mode);
  const title = pickEpisodeTitle(line.episode, mode);

  // 与搜索页共用“同一时刻只有一个播放器”的约定
  const isOpen = usePlayerStore((s) => s.playingId === line.id);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const [clip, setClip] = useState<ClipRange | null>(null);
  const [status, setStatus] = useState<ClipStatus>('idle');

  useEffect(
    () => () => {
      if (usePlayerStore.getState().playingId === line.id) usePlayerStore.getState().setPlaying(null);
    },
    [line.id],
  );

  // 免口令：播放地址只能从分享专用接口取，后端会校验这条台词确实属于该分享
  const source = useMemo<PlaySource>(
    () => ({
      queryKey: ['share-play', shareId, line.id],
      fetch: (signal) => fetchSharePlay(shareId, line.id, signal),
    }),
    [shareId, line.id],
  );

  const startClip = useCallback(() => {
    setPlaying(line.id);
    // 每次新对象：区间相同也会重播
    setClip({ startMs: line.startMs, endMs: line.endMs });
  }, [line.id, line.startMs, line.endMs, setPlaying]);

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setClip(null);
    setStatus('idle');
  }, [setPlaying]);

  const showPlayer = isOpen && clip !== null;
  const replay = showPlayer && status === 'ended';

  return (
    <li
      className={`animate-fade-up rounded-card border bg-surface p-4 shadow-soft sm:p-5 ${
        showPlayer ? 'border-brand-fg/60' : 'border-line'
      }`}
    >
      {/* 出处行：片名、季集、时间点，不可关闭（手册 §4.2 第 5 条） */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-sub">
        <span className="rounded-pill bg-brand-soft px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-fg">
          {formatEpisodeCode(line.episode.season, line.episode.episode)}
        </span>
        <span className="tabular-nums">{formatTime(line.startMs)}</span>
        <span className="min-w-0 truncate">
          · 《{SERIES_TITLE}》{title !== '' && ` ${title}`}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        {displayLines.map((l) => {
          const secondary = mode === 'both' && l.lang === 'zh';
          return (
            <p
              key={l.lang}
              lang={l.lang === 'en' ? 'en' : 'zh-CN'}
              className={`text-dialogue ${
                l.fallback ? 'text-ink-faint' : secondary ? 'text-ink-sub' : 'font-semibold text-ink'
              }`}
            >
              {l.text}
              {l.fallback && (
                <span className="ml-2 text-meta">（暂无{mode === 'en' ? '英文' : '中文'}）</span>
              )}
            </p>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!line.hasVideo}
          title={line.hasVideo ? undefined : '这一集暂无视频'}
          onClick={startClip}
          className="inline-flex items-center gap-1.5 rounded-pill bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-surface-muted disabled:text-ink-faint disabled:hover:brightness-100"
        >
          {replay ? <ReplayIcon /> : <PlayIcon />}
          {replay ? '重播' : '播放'}
        </button>
        {!line.hasVideo && <span className="text-meta text-ink-faint">暂无视频</span>}
      </div>

      {showPlayer && (
        <ClipPlayer lineId={line.id} source={source} clip={clip} onStatusChange={setStatus} onClose={closePlayer} />
      )}
    </li>
  );
}
