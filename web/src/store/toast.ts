// 轻量提示：同一时刻只显示一条，新的会替换旧的。
// 自己写而不是引入 toast 库（规则：不加未经说明的依赖），需求只有“一句话、几秒后消失”。
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** 每次 show 递增：连续弹出同样的文案时，也能让计时器重新开始 */
  seq: number;
  show: (message: string) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  seq: 0,
  show: (message) => set((s) => ({ message, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}));
