// 主题：首次跟随系统，用户手动切换后记住选择（localStorage）。
// 首屏的 dark 类由 index.html 里的内联脚本在渲染前设置（避免先白后黑的闪烁），
// 这里以 <html> 上的类为准来初始化，保证两边不会打架。
import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    // 隐私模式下访问 localStorage 可能抛错，当作“没有存过”
    return null;
  }
}

function applyToDocument(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeState {
  theme: Theme;
  /** 用户主动选择：写入存储，之后不再跟随系统 */
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  setTheme: (theme) => {
    applyToDocument(theme);
    set({ theme });
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 写入失败只影响“下次是否记住”，本次切换照常生效
    }
  },
}));

// 没有手动选择过时，系统外观变化（比如傍晚自动切深色）要跟着变
media.addEventListener('change', (e) => {
  if (readStored() !== null) return;
  const theme: Theme = e.matches ? 'dark' : 'light';
  applyToDocument(theme);
  useThemeStore.setState({ theme });
});
