import { useCallback, useEffect, useState } from 'react';
import type { SearchItem } from '../api/types';
import type { ClipStatus } from '../hooks/useClipPlayer';
import { usePlayerStore } from '../store/player';
import { MAX_SELECTION, useSelectionStore } from '../store/selection';
import { useToastStore } from '../store/toast';
import { formatEpisodeCode, formatTime } from '../lib/formatTime';
import { pickDisplayLines, pickEpisodeTitle, type LangMode } from '../lib/displayLines';
import { ClipPlayer, type ClipRange } from './ClipPlayer';
import { ContextDrawer } from './ContextDrawer';
import { HighlightText } from './HighlightText';
import { CheckIcon, ChevronDownIcon, PlayIcon, ReplayIcon } from './icons';

interface Props {
  line: SearchItem;
  mode: LangMode;
  /** 已拆分好的关键词，用于高亮 */
  terms: string[];
  /** 打开全屏片段蒙版（§7.2） */
  onOpenOverlay?: () => void;
}

export function ResultCard({ line, mode, terms, onOpenOverlay }: Props) {
  const displayLines = pickDisplayLines(line, mode);
  const title = pickEpisodeTitle(line.episode, mode);

  // 全局只记一个“正在播放的台词 ID”：别的卡片开始播放时，这里的 isOpen 变 false，播放器随之卸载
  const isOpen = usePlayerStore((s) => s.playingId === line.id);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  // clip 放在本地而不是 store：翻页回来时卡片重新挂载，clip 为 null，不会因为 ID 还残留就自动开播
  const [clip, setClip] = useState<ClipRange | null>(null);
  const [status, setStatus] = useState<ClipStatus>('idle');
  const [contextOpen, setContextOpen] = useState(false);
  // 勾选状态在全局 store 里（跨搜索、跨分页保留），这里只订阅“自己是否被选中”，
  // 返回布尔值，别的卡片勾选变化时本卡片不会重渲染
  const selected = useSelectionStore((s) => s.items.some((i) => i.id === line.id));
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const showToast = useToastStore((s) => s.show);
  const handleToggle = () => {
    // 满额时 store 拒绝加入，这里只负责告诉用户原因，不能让点击“没反应”
    if (toggleSelection(line) === 'limit') showToast(`最多选 ${MAX_SELECTION} 条，请先取消一些再选`);
  };

  // 每点一次播放键递增一次，用作脉冲圈的 key：换 key 才会让一次性动画重新播放
  const [pulse, setPulse] = useState(0);

  // 卡片卸载（翻页、换关键词）时，如果自己还占着“正在播放”，要让出来
  useEffect(
    () => () => {
      if (usePlayerStore.getState().playingId === line.id) usePlayerStore.getState().setPlaying(null);
    },
    [line.id],
  );

  // 每次都创建新对象：即使区间相同也会触发 ClipPlayer 重新播放（“重播”靠它）
  const startClip = useCallback(
    (range: ClipRange) => {
      setPlaying(line.id);
      setClip({ startMs: range.startMs, endMs: range.endMs });
      setPulse((n) => n + 1);
    },
    [line.id, setPlaying],
  );
  const closePlayer = useCallback(() => {
    setPlaying(null);
    setClip(null);
    setStatus('idle');
  }, [setPlaying]);

  const showPlayer = isOpen && clip !== null;
  const replay = showPlayer && status === 'ended';

  return (
    <li
      // 描边与底色分工：播放中用品牌色描边标出“当前焦点”，已勾选用浅品牌底色，两者可以叠加；
      // 其余卡片靠 hover 上浮提示可交互
      className={`animate-fade-up rounded-card border p-4 shadow-soft transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift sm:p-5 ${
        showPlayer ? 'border-brand-fg/60' : selected ? 'border-brand-fg/30' : 'border-line'
      } ${selected ? 'bg-brand-soft/50' : 'bg-surface'}`}
      onClick={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest('button, label, input, [role="dialog"]')) return;
        onOpenOverlay?.();
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-sub">
        {/* 视觉上是 20px 的小方框，外层 label 的内边距把可点区域撑到 40px（移动端手指好点）；
            负外边距抵消内边距，不影响与右侧文字的间距。真正的 checkbox 保留给读屏与键盘 */}
        <label
          className="-my-2.5 -ml-2.5 -mr-1 flex cursor-pointer items-center p-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={handleToggle}
            aria-label={`选择 ${formatEpisodeCode(line.episode.season, line.episode.episode)} ${formatTime(line.startMs)} 的台词`}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-fg peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface-page ${
              selected ? 'border-brand bg-brand text-white' : 'border-ink-faint bg-surface hover:border-brand-fg'
            }`}
          >
            {selected && <CheckIcon className="text-[0.8rem]" />}
          </span>
        </label>
        {/* 集号胶囊 + 台词开始时间，方便用户定位到视频里的位置 */}
        <span className="rounded-pill bg-brand-soft px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-fg">
          {formatEpisodeCode(line.episode.season, line.episode.episode)}
        </span>
        <span className="tabular-nums">{formatTime(line.startMs)}</span>
        {title !== '' && <span className="min-w-0 truncate">· {title}</span>}
      </div>

      <div className="mt-3 space-y-1">
        {displayLines.map((l) => {
          // 双语时中文作为译文，降一档层级，让视线先落在原文上
          const secondary = mode === 'both' && l.lang === 'zh';
          return (
            <p
              key={l.lang}
              lang={l.lang === 'en' ? 'en' : 'zh-CN'}
              className={`text-dialogue ${
                l.fallback ? 'text-ink-faint' : secondary ? 'text-ink-sub' : 'font-semibold text-ink'
              }`}
            >
              <HighlightText text={l.text} terms={terms} />
              {l.fallback && (
                <span className="ml-2 text-meta">（暂无{mode === 'en' ? '英文' : '中文'}）</span>
              )}
            </p>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onOpenOverlay && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenOverlay();
            }}
            className="inline-flex items-center gap-1 rounded-pill border border-brand-fg/40 bg-brand-soft/60 px-3.5 py-1.5 text-sm font-semibold text-brand-fg transition hover:bg-brand-soft active:scale-[0.98]"
          >
            查看片段
          </button>
        )}
        <button
          type="button"
          disabled={!line.hasVideo}
          title={line.hasVideo ? undefined : '这一集暂无视频'}
          onClick={(e) => {
            e.stopPropagation();
            startClip({ startMs: line.startMs, endMs: line.endMs });
          }}
          className="relative inline-flex items-center gap-1.5 rounded-pill bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-surface-muted disabled:text-ink-faint disabled:hover:brightness-100"
        >
          {replay ? <ReplayIcon /> : <PlayIcon />}
          {replay ? '重播' : '播放'}
          {pulse > 0 && (
            <span key={pulse} aria-hidden className="pointer-events-none absolute inset-0 rounded-pill animate-pulse-once" />
          )}
        </button>
        <button
          type="button"
          aria-expanded={contextOpen}
          onClick={(e) => {
            e.stopPropagation();
            setContextOpen((v) => !v);
          }}
          className="inline-flex items-center gap-1 rounded-pill border border-line px-3.5 py-1.5 text-sm text-ink-sub transition hover:border-brand-fg hover:text-brand-fg active:scale-[0.98]"
        >
          上下文
          <ChevronDownIcon className={`transition-transform duration-200 ${contextOpen ? 'rotate-180' : ''}`} />
        </button>
        {!line.hasVideo && <span className="text-meta text-ink-faint">暂无视频</span>}
      </div>

      {showPlayer && (
        <ClipPlayer lineId={line.id} clip={clip} onStatusChange={setStatus} onClose={closePlayer} />
      )}

      {contextOpen && (
        <ContextDrawer lineId={line.id} mode={mode} terms={terms} canPlay={line.hasVideo} onPlay={startClip} />
      )}
    </li>
  );
}
