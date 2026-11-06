import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, shouldRetry } from '../api/client';
import { fetchShare } from '../api/shares';
import { LogoMark, SearchIllustration } from '../components/icons';
import { LangToggle } from '../components/LangToggle';
import { ResultSkeleton } from '../components/ResultSkeleton';
import { ShareLineCard } from '../components/ShareLineCard';
import { ErrorBar } from '../components/StateViews';
import { ThemeToggle } from '../components/ThemeToggle';
import { useLangStore } from '../store/lang';

const primaryLink =
  'rounded-pill bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]';

/** 分享页 /s/:id：只读、免口令（手册 §7.1）。 */
export default function SharePage() {
  const { id = '' } = useParams();
  const mode = useLangStore((s) => s.mode);

  const share = useQuery({
    queryKey: ['share', id],
    queryFn: ({ signal }) => fetchShare(id, signal),
    retry: shouldRetry,
    // 每次成功读取后端都会给浏览量 +1：缓存永不过期，重新挂载 / 回到页面都不再重复请求，避免刷高数字
    staleTime: Infinity,
  });

  useEffect(() => {
    document.title = '分享的台词 - 台词搜索';
  }, []);

  const gone = share.error instanceof ApiError && share.error.status === 404;

  let body;
  if (gone) {
    body = (
      <div className="animate-fade-up py-12 text-center">
        <SearchIllustration className="mx-auto h-28 w-40" />
        <p className="mt-4 text-lg font-semibold">分享已失效</p>
        <p className="mt-1 text-sm text-ink-sub">链接可能有误，或其中的台词已被移除。</p>
        <Link to="/" className={`mt-5 inline-block ${primaryLink}`}>
          去搜索
        </Link>
      </div>
    );
  } else if (share.isError) {
    body = <ErrorBar error={share.error} onRetry={() => void share.refetch()} />;
  } else if (!share.data) {
    body = <ResultSkeleton count={3} />;
  } else {
    const { note, items } = share.data;
    body = (
      <div className="space-y-6">
        {note && (
          // 留言是用户输入，只按纯文本渲染（React 默认转义），whitespace-pre-line 保留换行
          <blockquote className="whitespace-pre-line rounded-card border border-line bg-brand-soft px-4 py-3 text-sm text-ink">
            {note}
          </blockquote>
        )}
        <ul className="space-y-3">
          {items.map((item) => (
            <ShareLineCard key={item.id} shareId={share.data.id} line={item} mode={mode} />
          ))}
        </ul>
        <div className="pt-2 text-center">
          <Link to="/" className={`inline-block ${primaryLink}`}>
            去搜索更多
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="page-backdrop page-backdrop-soft" aria-hidden />
      <div className="mx-auto max-w-3xl px-4 pb-20">
        <header className="flex items-center gap-3 pb-4 pt-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 rounded-control text-base font-extrabold">
            <LogoMark className="h-8 w-8" />
            <span>台词搜索</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </header>
        <main>
          <h1 className="mb-4 text-lg font-extrabold">有人分享了几句台词</h1>
          {body}
        </main>
      </div>
    </div>
  );
}
