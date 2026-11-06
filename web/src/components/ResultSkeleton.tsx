// 加载中的骨架屏：占位高度与真实卡片接近，减少结果出来时的页面跳动。
// 流光动画由 .skeleton + animate-shimmer 提供；“减少动态效果”下会被全局规则关掉，退化成静态灰块。
export function ResultSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul aria-busy="true" aria-label="加载中" className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="rounded-card border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <div className="skeleton h-5 w-14 animate-shimmer rounded-pill" />
            <div className="skeleton h-3 w-12 animate-shimmer rounded" />
          </div>
          <div className="skeleton mt-4 h-4 w-3/4 animate-shimmer rounded" />
          <div className="skeleton mt-2.5 h-4 w-1/2 animate-shimmer rounded" />
          <div className="skeleton mt-5 h-8 w-24 animate-shimmer rounded-pill" />
        </li>
      ))}
    </ul>
  );
}
