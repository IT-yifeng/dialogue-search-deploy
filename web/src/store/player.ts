// 当前播放中的台词 ID（手册 §7.5）。
// 只存一个 ID 就能保证“同一时刻只有一个播放器”：开新的时旧卡片发现 ID 不是自己，就卸载播放器。
import { create } from 'zustand';

interface PlayerState {
  playingId: number | null;
  setPlaying: (id: number | null) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  playingId: null,
  setPlaying: (id) => set({ playingId: id }),
}));
