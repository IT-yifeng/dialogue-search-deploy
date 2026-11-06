import { formatResultTotal } from '../lib/resultCount';
import { ChevronDownIcon } from './icons';

interface Props {
  season: number | undefined;
  exact: boolean;
  /** 可选的季号；接口失败或加载中时可能为空 */
  seasons: number[];
  /** 结果总数；还没拿到结果时为 undefined，不显示 */
  total: number | undefined;
  onSeasonChange: (season: number | undefined) => void;
  onExactChange: (exact: boolean) => void;
}

export function FilterBar({ season, exact, seasons, total, onSeasonChange, onExactChange }: Props) {
  // URL 里的季不在列表中（季集列表还没加载完，或手改了 URL）时也要保留这个选项，
  // 否则 <select> 会悄悄显示成“全部”，和实际筛选条件不一致
  const options =
    season !== undefined && !seasons.includes(season)
      ? [...seasons, season].sort((a, b) => a - b)
      : seasons;
  const active = season !== undefined;
  const totalLabel = total !== undefined ? formatResultTotal(total) : '';

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-ink-sub">
      {/* 原生 <select> 外面包一层胶囊：保留系统自带的无障碍与移动端选择器，只改外观 */}
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`relative inline-flex items-center rounded-pill border transition ${
            active ? 'border-brand-fg bg-brand-soft text-brand-fg' : 'border-line bg-surface text-ink-sub'
          }`}
        >
          <span className="sr-only">按季筛选</span>
          <select
            value={season ?? ''}
            onChange={(e) => onSeasonChange(e.target.value === '' ? undefined : Number(e.target.value))}
            className="cursor-pointer appearance-none rounded-pill bg-transparent py-1.5 pl-3.5 pr-8 font-medium"
          >
            <option value="">全部季</option>
            {options.map((s) => (
              <option key={s} value={s}>
                第 {s} 季
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3" />
        </label>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-ink-sub transition hover:border-brand-fg">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line text-brand focus:ring-brand-fg"
            checked={exact}
            onChange={(e) => onExactChange(e.target.checked)}
          />
          <span className="font-medium">仅完整台词</span>
        </label>
      </div>
      {total !== undefined && (
        <span aria-live="polite" className="text-ink">
          {totalLabel}
        </span>
      )}
    </div>
  );
}
