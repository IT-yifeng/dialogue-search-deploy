import { useEffect } from 'react';
import { useToastStore } from '../store/toast';

const VISIBLE_MS = 2500;

/** 挂在 App 根部。aria-live 让读屏软件能念出“最多选 20 条”这类无焦点变化的提示 */
export function Toast() {
  const message = useToastStore((s) => s.message);
  const seq = useToastStore((s) => s.seq);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(hide, VISIBLE_MS);
    return () => window.clearTimeout(timer);
    // seq 变化也要重置计时，否则同文案连点会提前消失
  }, [message, seq, hide]);

  return (
    <div
      role="status"
      aria-live="polite"
      // 放在顶部以免被底部悬浮条挡住。注意：原生 <dialog>.showModal() 在浏览器“顶层”，
      // 任何 z-index 都盖不过它，所以对话框内的反馈（如“已复制”）要在对话框里自己显示，不走这里
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4"
    >
      {message !== null && (
        <div
          key={seq}
          className="animate-fade-up rounded-pill border border-line bg-surface px-4 py-2 text-sm font-medium text-ink shadow-lift"
        >
          {message}
        </div>
      )}
    </div>
  );
}
