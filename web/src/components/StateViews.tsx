// 搜索页的几种非“有结果”状态：无结果、页码越界、错误。
// 空搜索的首页见 Hero.tsx。
import { canRetryApiError, formatApiErrorMessage } from '../lib/errorMessage';
import { AlertIcon, SearchIllustration } from './icons';

const primaryBtn =
  'rounded-pill bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]';

export function NoResults({ q }: { q: string }) {
  return (
    <div className="animate-fade-up py-12 text-center">
      <SearchIllustration className="mx-auto h-28 w-40" />
      <p className="mt-4 text-lg font-semibold">没有找到「{q}」</p>
      <ul className="mx-auto mt-4 inline-block space-y-1.5 text-left text-sm text-ink-sub">
        <li>· 少写几个词试试（多个词需要同时出现）</li>
        <li>· 换成中文或英文再搜</li>
        <li>· 检查是否限定了季，可以改回「全部季」</li>
      </ul>
    </div>
  );
}

/** 手改 URL 把页码改得过大时：有结果但这一页是空的 */
export function PageOutOfRange({ onBack }: { onBack: () => void }) {
  return (
    <div className="animate-fade-up py-12 text-center">
      <SearchIllustration className="mx-auto h-28 w-40" />
      <p className="mt-4 text-ink-sub">这一页没有结果</p>
      <button type="button" onClick={onBack} className={`mt-4 ${primaryBtn}`}>
        回到第 1 页
      </button>
    </div>
  );
}

export function ErrorBar({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = formatApiErrorMessage(error, '搜索失败，请稍后重试');
  const showRetry = canRetryApiError(error);

  return (
    <div
      role="alert"
      className="flex animate-fade-up items-center justify-between gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <span className="flex items-center gap-2">
        <AlertIcon className="shrink-0 text-lg" />
        {message}
      </span>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-pill border border-danger/40 bg-surface px-3.5 py-1 font-medium transition hover:bg-danger-soft active:scale-[0.98]"
        >
          重试
        </button>
      )}
    </div>
  );
}
