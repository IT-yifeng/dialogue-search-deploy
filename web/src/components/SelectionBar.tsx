import { MAX_SELECTION, useSelectionStore } from '../store/selection';
import { ShareIcon } from './icons';

/** 底部悬浮条：有勾选才出现（手册 §7.2）。点「预览 / 分享」交给父组件打开对话框 */
export function SelectionBar({ onOpenShare }: { onOpenShare: () => void }) {
  const count = useSelectionStore((s) => s.items.length);
  const clear = useSelectionStore((s) => s.clear);

  if (count === 0) return null;

  return (
    // 外层不拦截点击，只有中间的条本身可交互，避免两侧空白挡住下面的分页按钮；
    // 底部内边距兼顾 iOS 的安全区（小白条）
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <section
        aria-label="已选台词"
        className="pointer-events-auto mx-auto flex max-w-3xl animate-fade-up items-center gap-3 rounded-card border border-line bg-surface/90 px-4 py-3 shadow-lift backdrop-blur-xl"
      >
        <p className="min-w-0 flex-1 text-sm">
          已选 <span className="font-extrabold tabular-nums text-brand-fg">{count}</span>
          <span className="text-ink-faint"> / {MAX_SELECTION}</span> 条
        </p>
        <button
          type="button"
          onClick={clear}
          className="shrink-0 rounded-pill px-3 py-1.5 text-sm text-ink-sub transition hover:text-brand-fg active:scale-[0.98]"
        >
          清空
        </button>
        <button
          type="button"
          onClick={onOpenShare}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
        >
          <ShareIcon />
          预览 / 分享
        </button>
      </section>
    </div>
  );
}
