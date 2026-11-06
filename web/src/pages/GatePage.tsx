import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/auth';
import { ApiError } from '../api/client';
import { AlertIcon, LogoMark } from '../components/icons';
import { ThemeToggle } from '../components/ThemeToggle';
import { sanitizeNext } from '../lib/gateRedirect';

/** 把后端错误转成用户看得懂的话；口令错误与限流要区分开，否则用户不知道该改口令还是该等一等 */
function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_PASSCODE') return '口令不对，请再试一次';
    if (err.code === 'RATE_LIMITED') return '尝试次数太多了，请一分钟后再试';
    if (err.code === 'NETWORK') return '无法连接服务器，请检查网络后重试';
  }
  return '服务出错了，请稍后重试';
}

// 手册 §7.1：未登录访问任何页面都会跳到这里。设计稿里没有口令页，视觉沿用首页的令牌与组件风格。
export default function GatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [passcode, setPasscode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || passcode === '') return;
    setPending(true);
    setError(null);
    try {
      await login(passcode);
      // replace：登录页不该留在历史记录里，否则登录后点“后退”又回到口令页
      navigate(sanitizeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(messageFor(err));
      setPending(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="page-backdrop" aria-hidden="true" />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="flex items-center gap-2 font-extrabold">
          <LogoMark className="h-8 w-8" />
          台词搜索
        </span>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex max-w-md animate-fade-up flex-col px-4 pb-16 pt-16 sm:pt-24">
        <h1 className="text-3xl font-extrabold tracking-tight">输入口令</h1>
        <p className="mt-2 text-ink-sub">这是一个私有站点，需要口令才能使用。</p>

        <form onSubmit={handleSubmit} className="mt-8">
          <div className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1.5 shadow-glow transition focus-within:border-brand-fg focus-within:ring-2 focus-within:ring-brand-fg/30">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="站点口令"
              aria-label="站点口令"
              aria-invalid={error !== null}
              autoFocus
              autoComplete="current-password"
              maxLength={200}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base placeholder:text-ink-faint focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="submit"
              disabled={pending || passcode === ''}
              className="shrink-0 rounded-pill bg-brand-gradient px-6 py-3 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? '验证中…' : '进入'}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger">
              <AlertIcon className="shrink-0 text-lg" />
              {error}
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
