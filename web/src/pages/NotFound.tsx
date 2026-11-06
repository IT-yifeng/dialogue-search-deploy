import { Link } from 'react-router-dom';
import { SearchIllustration } from '../components/icons';

// 手册 §7.1：404 页同时承担「分享已失效」文案，M5 做分享页时复用
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchIllustration className="h-28 w-40" />
      <p className="text-lg font-semibold">页面不存在，或分享已失效</p>
      <Link
        to="/"
        className="rounded-pill bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
      >
        回到搜索
      </Link>
    </main>
  );
}
