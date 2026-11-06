import { useQuery } from '@tanstack/react-query';
import type { SearchItem } from '../api/types';
import { fetchDiscover } from '../api/search';
import { FilmIcon, LanguagesIcon, LayersIcon, SparkIcon } from './icons';
import { DiscoverGrid } from './DiscoverGrid';
import { SearchBar } from './SearchBar';
import type { LangMode } from '../lib/displayLines';

// 示例词带语种标注：告诉用户中英文都能搜，点击即搜。
// 选的是库里确定有结果的词，避免首页第一次点击就看到“没有找到”。
const EXAMPLES = [
  { text: 'Penny', tag: '英' },
  { text: '佩妮', tag: '中' },
  { text: 'Sheldon', tag: '英' },
  { text: '谢尔顿', tag: '中' },
];

const FEATURES = [
  { Icon: LanguagesIcon, title: '中英对照', desc: '每条台词同时显示英文和中文，也可以只看一种。' },
  { Icon: FilmIcon, title: '点一下就播放', desc: '在卡片里直接播放那一句，播完自动停下。' },
  { Icon: LayersIcon, title: '展开上下文', desc: '看前后几句，从任意一句接着播。' },
];

interface Props {
  value: string;
  onSubmit: (q: string) => void;
  mode: LangMode;
  highlightTerms: string[];
  /** 第三个参数是当次拿到的 9 条列表，避免父组件再拉一遍 discover */
  onDiscoverPick: (line: SearchItem, index: number, items: SearchItem[]) => void;
}

/** 空搜索时的首页：不请求列表接口，引导输入；同时请求 discover 填满 9 张推荐卡（手册 §7.2） */
export function Hero({ value, onSubmit, mode, highlightTerms, onDiscoverPick }: Props) {
  // 手册 §6：discover 每次请求重新抽样；首页不能只展示缓存，否则刷新也看不到新推荐
  const discover = useQuery({
    queryKey: ['discover'],
    queryFn: ({ signal }) => fetchDiscover(signal),
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <section className="mx-auto max-w-2xl pb-10 pt-8 text-center sm:pt-16">
      <span className="inline-flex animate-fade-up items-center gap-1.5 rounded-pill border border-brand-fg/30 bg-surface/70 px-3 py-1 text-xs font-semibold text-brand-fg backdrop-blur">
        <SparkIcon />
        中英对照台词搜索
      </span>

      <h1 className="mt-5 animate-fade-up text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
        {/* 两段都是 inline-block：窄屏换行时只会在两段之间断开，不会把“台词”“那一幕”拆开 */}
        <span className="inline-block">搜一句台词，</span>
        <span className="inline-block bg-gradient-to-r from-[#0a6475] to-[#1595ab] bg-clip-text text-transparent dark:from-[#4fd1e0] dark:to-[#8be3ee]">
          看那一幕
        </span>
      </h1>
      <p className="mx-auto mt-4 max-w-xl animate-fade-up text-base text-ink-sub sm:text-lg">
        输入中文或英文关键词，找到带中英对照的台词，点一下就能播放对应片段。
      </p>

      <div className="mt-8 animate-fade-up">
        <SearchBar value={value} onSubmit={onSubmit} size="lg" />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-meta text-ink-faint">试试这些</span>
        {EXAMPLES.map((e) => (
          <button
            key={e.text}
            type="button"
            onClick={() => onSubmit(e.text)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-fg hover:text-brand-fg hover:shadow-soft active:scale-[0.98]"
          >
            {e.text}
            <span className="rounded-pill bg-surface-muted px-1.5 text-[11px] font-semibold text-ink-sub">{e.tag}</span>
          </button>
        ))}
      </div>

      <ul className="mt-14 grid gap-3 text-left sm:grid-cols-3">
        {FEATURES.map(({ Icon, title, desc }) => (
          <li key={title} className="rounded-card border border-line bg-surface/80 p-4 backdrop-blur">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-brand-soft text-lg text-brand-fg">
              <Icon />
            </span>
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-meta text-ink-sub">{desc}</p>
          </li>
        ))}
      </ul>

      {discover.isError ? null : discover.data && discover.data.items.length > 0 ? (
        <DiscoverGrid
          lines={discover.data.items}
          terms={highlightTerms}
          onPick={(line, i) => onDiscoverPick(line, i, discover.data!.items)}
        />
      ) : discover.isPending ? (
        <div className="mt-14 h-40 animate-pulse rounded-card bg-surface-muted" aria-hidden />
      ) : null}
    </section>
  );
}
