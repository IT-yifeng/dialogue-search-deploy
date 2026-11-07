// 首页「随机推荐」9 宫格（手册 §7.2）。点击画面上方区域打开片段蒙版；卡片内字幕固定中英双语。
import type { SearchItem } from '../api/types';
import { SnippetCard } from './SnippetCard';

interface Props {
  lines: SearchItem[];
  /** 仅用于关键词高亮；推荐区通常为 [] */
  terms: string[];
  onPick: (line: SearchItem, index: number) => void;
}

export function DiscoverGrid({ lines, terms, onPick }: Props) {
  return (
    <section className="mt-14 animate-fade-up" aria-label="随机推荐">
      <h2 className="text-center text-lg font-extrabold text-ink">随机推荐</h2>
      <p className="mx-auto mt-2 max-w-lg text-center text-meta text-ink-sub">
        从有视频的台词里随机抽 9 条，点卡片看片段
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        {lines.map((line, i) => (
          <li key={line.id}>
            <SnippetCard line={line} terms={terms} variant="discover" onOpenOverlay={() => onPick(line, i)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
