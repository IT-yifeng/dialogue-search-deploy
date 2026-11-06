// 管线内共用的类型。所有时间都是毫秒，且都是“视频时间”。

/** SRT 里的一条原始字幕。text 可能含多行（以 \n 分隔）。 */
export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

/** 已拆好中英、但还没分配集内序号的台词。任一侧可以为空串。 */
export interface DraftLine {
  startMs: number;
  endMs: number;
  en: string;
  zh: string;
}

/** 可以入库的台词：idx 是集内从 0 开始的连续序号。 */
export interface Line extends DraftLine {
  idx: number;
}

export interface EpisodeKey {
  season: number;
  episode: number;
}
