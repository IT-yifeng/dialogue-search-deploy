import { useEffect, useState, type FormEvent } from 'react';
import { MAX_QUERY_LENGTH } from '../lib/highlight';
import { CloseIcon, SearchIcon } from './icons';

interface Props {
  /** 当前生效的关键词（来自 URL） */
  value: string;
  onSubmit: (q: string) => void;
  /** lg：首页 hero 里的大号搜索框；md：结果页吸顶顶栏里的紧凑版 */
  size?: 'md' | 'lg';
}

// 输入过程中的草稿只存在本组件里，提交时才写入 URL；不请求数据
export function SearchBar({ value, onSubmit, size = 'md' }: Props) {
  const [draft, setDraft] = useState(value);
  const isLg = size === 'lg';

  // 浏览器后退 / 前进、点击示例词会改变 URL，输入框要跟着变
  useEffect(() => setDraft(value), [value]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(draft);
  };

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      // 输入框和按钮包在同一个胶囊里，聚焦时整体亮起，比两个分离的控件更像一个整体
      className={`group flex items-center gap-1 rounded-pill border border-line bg-surface transition focus-within:border-brand-fg focus-within:ring-2 focus-within:ring-brand-fg/30 ${
        isLg ? 'p-1.5 shadow-glow' : 'p-1 shadow-soft'
      }`}
    >
      <SearchIcon className={`ml-3 shrink-0 text-ink-faint ${isLg ? 'text-xl' : 'text-lg'}`} />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={MAX_QUERY_LENGTH}
        placeholder={isLg ? '输入中文或英文关键词' : '搜索台词'}
        aria-label="搜索关键词"
        // 只在首页自动聚焦：结果页每次渲染都抢焦点，会在手机上不停弹出键盘
        autoFocus={isLg}
        enterKeyHint="search"
        className={`min-w-0 flex-1 bg-transparent px-2 placeholder:text-ink-faint focus-visible:ring-0 focus-visible:ring-offset-0 ${
          isLg ? 'py-3 text-base sm:text-lg' : 'py-1.5 text-base'
        }`}
      />
      {draft !== '' && (
        <button
          type="button"
          onClick={() => setDraft('')}
          aria-label="清空输入"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-ink-faint hover:bg-surface-muted hover:text-ink"
        >
          <CloseIcon />
        </button>
      )}
      <button
        type="submit"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand-gradient font-semibold text-white transition hover:brightness-110 active:scale-[0.98] ${
          isLg ? 'px-6 py-3 text-base' : 'px-4 py-1.5 text-sm'
        }`}
      >
        {/* 窄屏的紧凑版只放图标省空间；大号版始终显示文字 */}
        {!isLg && <SearchIcon className="sm:hidden" />}
        <span className={isLg ? '' : 'hidden sm:inline'}>搜索</span>
      </button>
    </form>
  );
}
