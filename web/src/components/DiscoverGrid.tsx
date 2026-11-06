// 首页「随机推荐」9 宫格（手册 §7.2、§7.6）。点击卡片打开片段蒙版。
import type { SearchItem } from '../api/types';
import { formatSeasonEpisodeLabel } from '../lib/formatTime';
import { pickDisplayLines, type LangMode } from '../lib/displayLines';
import { HighlightText } from './HighlightText';
import { useVideoMidFrame } from '../hooks/useVideoMidFrame';
interface Props {
  lines: SearchItem[];
  mode: LangMode;
  terms: string[];
  onPick: (line: SearchItem, index: number) => void;
}

function DiscoverCard({
  line,
  mode,
  terms,
  onClick,
}: {
  line: SearchItem;
  mode: LangMode;
  terms: string[];
  onClick: () => void;
}) {
  const { dataUrl, loading, videoRef } = useVideoMidFrame(line, true);
  const display = pickDisplayLines(line, mode);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-[4/5] w-full overflow-hidden rounded-card border border-line bg-surface-muted text-left shadow-soft transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift"
    >
      <video ref={videoRef} muted playsInline preload="metadata" className="hidden" crossOrigin="anonymous" />

      {/* 底图：成功用截图，否则纯色 */}
      <div
        className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-[1.02]"
        style={
          dataUrl
            ? { backgroundImage: `linear-gradient(to top, rgb(0 0 0 / 0.65), rgb(0 0 0 / 0.15)), url(${dataUrl})` }
            : { background: 'linear-gradient(145deg, rgb(var(--c-brand-soft)), rgb(var(--c-muted)))' }
        }
      />
      {/* 暗角 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 48px rgb(0 0 0 / 0.35)',
        }}
      />

      <span className="absolute left-2 top-2 rounded-pill bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
        {formatSeasonEpisodeLabel(line.episode.season, line.episode.episode)}
      </span>

      {loading && (
        <span className="absolute right-2 top-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-3 pt-10">
        {display.map((l) => (
          <p
            key={l.lang}
            lang={l.lang === 'en' ? 'en' : 'zh-CN'}
            className={`text-sm leading-snug drop-shadow-[0_1px_2px_rgb(0_0_0/0.9)] ${
              mode === 'both' && l.lang === 'zh' ? 'mt-0.5 text-white/85' : 'font-semibold text-white'
            }`}
          >
            <HighlightText text={l.text} terms={terms} />
          </p>
        ))}
      </div>
    </button>
  );
}

export function DiscoverGrid({ lines, mode, terms, onPick }: Props) {
  const hl = terms;
  return (
    <section className="mt-14 animate-fade-up" aria-label="随机推荐">
      <h2 className="text-center text-lg font-extrabold text-ink">随机推荐</h2>
      <p className="mx-auto mt-2 max-w-lg text-center text-meta text-ink-sub">从有视频的台词里随机抽 9 条，点卡片看片段</p>
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lines.map((line, i) => (
          <li key={line.id}>
            <DiscoverCard line={line} mode={mode} terms={hl} onClick={() => onPick(line, i)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
