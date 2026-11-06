import { pageItems } from '../lib/pagination';

interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

// 页码按钮统一是圆形 / 胶囊，高度 40px，手机上也容易点中
const btn =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-pill border border-line bg-surface px-3 text-sm transition active:scale-[0.98]';
const textBtn = `${btn} text-ink-sub hover:border-brand-fg hover:text-brand-fg disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:border-line disabled:hover:text-ink-faint`;

export function Pagination({ page, totalPages, onChange }: Props) {
  const items = pageItems(page, totalPages);
  if (items.length === 0) return null;

  return (
    <nav aria-label="分页" className="flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className={textBtn}>
        上一页
      </button>
      {items.map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-ink-faint">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
            className={`${btn} tabular-nums ${
              item === page
                ? 'border-transparent bg-brand-gradient font-semibold text-white'
                : 'text-ink-sub hover:border-brand-fg hover:text-brand-fg'
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className={textBtn}>
        下一页
      </button>
    </nav>
  );
}
