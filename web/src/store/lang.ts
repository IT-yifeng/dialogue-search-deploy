// 语言模式：Zustand + localStorage，默认双语（手册 §7.3、§7.5）。
import { create } from 'zustand';
import type { LangMode } from '../lib/displayLines';

const STORAGE_KEY = 'lang-mode';
const MODES: readonly LangMode[] = ['en', 'zh', 'both'];

function isMode(v: unknown): v is LangMode {
  return MODES.includes(v as LangMode);
}

// 隐私模式下访问 localStorage 可能直接抛错，或值被手动改坏，一律回退默认，不能让页面白屏
function readInitial(): LangMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isMode(v) ? v : 'both';
  } catch {
    return 'both';
  }
}

interface LangState {
  mode: LangMode;
  setMode: (mode: LangMode) => void;
}

export const useLangStore = create<LangState>((set) => ({
  mode: readInitial(),
  setMode: (mode) => {
    set({ mode });
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // 写入失败（配额、隐私模式）只影响“下次打开是否记住”，本次切换照常生效
    }
  },
}));
