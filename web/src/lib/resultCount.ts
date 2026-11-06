// 结果数展示文案（手册 §7.3）
export function formatResultTotal(total: number): string {
  if (total <= 5000) return `${total.toLocaleString('zh-CN')} 条结果`;
  if (total <= 30_000) return '5,000+ 条结果';
  return '海量结果';
}
