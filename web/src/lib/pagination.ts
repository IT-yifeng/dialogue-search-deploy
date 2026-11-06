/**
 * 生成分页条要展示的页码：首尾页始终显示，当前页前后各 siblings 页，中间缺口用 'gap' 表示。
 * 例：current=10,total=20 → [1, gap, 8, 9, 10, 11, 12, gap, 20]
 * 缺口只有 1 页时直接显示该页码，而不是用省略号占位（省略号比页码还占地方）。
 */
export type PageItem = number | 'gap';

export function pageItems(current: number, total: number, siblings = 2): PageItem[] {
  if (total <= 1) return [];
  const pages = new Set<number>([1, total]);
  for (let p = current - siblings; p <= current + siblings; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  const out: PageItem[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev !== 0 && p - prev === 2) out.push(prev + 1);
    else if (prev !== 0 && p - prev > 2) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}
