// 片段播放窗口：台词起止前后各留一点缓冲。
// 台词时间戳是字幕的“显示时间”，刚好卡点播放会吞掉开头的字和结尾的尾音，听起来像被截断。

/** 开头多留 0.4s，让人先听到一点铺垫再进入台词 */
export const LEAD_MS = 400;
/** 结尾多留 0.3s，避免尾音被切掉 */
export const TAIL_MS = 300;

export interface ClipWindow {
  /** 开始播放的位置，单位秒（<video>.currentTime 用秒） */
  seekTo: number;
  /** 播放到这个位置就暂停，单位秒 */
  stopAt: number;
}

export function clipWindow(startMs: number, endMs: number): ClipWindow {
  return {
    // 台词在片头附近时 startMs - LEAD 会变负，currentTime 不接受负值
    seekTo: Math.max(0, startMs - LEAD_MS) / 1000,
    stopAt: (endMs + TAIL_MS) / 1000,
  };
}
