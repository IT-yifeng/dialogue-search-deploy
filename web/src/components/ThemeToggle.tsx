import { useThemeStore } from '../store/theme';
import { MoonIcon, SunIcon } from './icons';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-line bg-surface text-lg text-ink-sub transition hover:text-brand-fg active:scale-[0.98]"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
