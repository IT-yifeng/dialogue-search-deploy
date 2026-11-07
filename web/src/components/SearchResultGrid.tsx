// 有搜索词时的九宫格结果（手册 §7.2、§7.3）：与首页推荐卡同构；底部保留勾选 / 播放 / 上下文。
import type { SearchItem } from '../api/types';
import { SnippetCard, type OverlayOpenOptions } from './SnippetCard';

interface Props {
  items: SearchItem[];
  terms: string[];
  onOpenOverlay: (index: number, opts?: OverlayOpenOptions) => void;
}

export function SearchResultGrid({ items, terms, onOpenOverlay }: Props) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((line, i) => (
        <li key={line.id}>
          <SnippetCard
            line={line}
            terms={terms}
            variant="search"
            onOpenOverlay={(opts) => onOpenOverlay(i, opts)}
          />
        </li>
      ))}
    </ul>
  );
}
