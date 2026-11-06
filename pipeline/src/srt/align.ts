import type { Cue, DraftLine, Line } from '../types.js';

/**
 * 副语言字幕归到某条主语言字幕所需的最小重叠比例：
 * 重叠时长 / 两者中较短的时长。低于它就认为“碰巧擦边”，不归并。
 */
const MIN_OVERLAP_RATIO = 0.3;

function overlap(a: Cue, b: Cue): number {
  return Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
}

/**
 * 把分开的英文、中文字幕按时间重叠对齐成双语台词。
 *
 * - 以条数更多的一方为“主语言”（通常是英文）：一条中文只能归到一条英文，
 *   这样既不会重复展示，也不会丢条目。
 * - 多条副语言字幕落在同一条主语言内时，按时间顺序用空格拼接。
 * - 一条副语言字幕横跨两条主语言时，只归给重叠更大的那条（并列取靠前的）；
 *   另一条的副语言侧会是空的，这比两边都显示同一句更不容易误导。
 * - 配不上的副语言字幕单独成行（比如只有中文），保证不丢台词，
 *   它们会在 QA 里体现为“非双语”。
 * 两个输入都需按开始时间排序；用游标扫描，复杂度 O(n+m)。
 */
export function alignCues(en: Cue[], zh: Cue[]): DraftLine[] {
  const enIsBase = en.length >= zh.length;
  const base = enIsBase ? en : zh;
  const other = enIsBase ? zh : en;

  const attached: string[][] = base.map(() => []);
  const standalone: Cue[] = [];
  let lo = 0;

  for (const cue of other) {
    // 游标前进：跳过已经完全结束在当前副语言条目之前的主语言条目
    while (lo < base.length && base[lo]!.endMs <= cue.startMs) lo++;
    let best = -1;
    let bestOverlap = 0;
    for (let i = lo; i < base.length && base[i]!.startMs < cue.endMs; i++) {
      const o = overlap(base[i]!, cue);
      if (o > bestOverlap) {
        best = i;
        bestOverlap = o;
      }
    }
    const shorter = Math.min(cue.endMs - cue.startMs, best >= 0 ? base[best]!.endMs - base[best]!.startMs : 0);
    if (best >= 0 && shorter > 0 && bestOverlap / shorter >= MIN_OVERLAP_RATIO) {
      attached[best]!.push(cue.text);
    } else {
      standalone.push(cue);
    }
  }

  const make = (c: Cue, otherText: string): DraftLine =>
    enIsBase
      ? { startMs: c.startMs, endMs: c.endMs, en: c.text, zh: otherText }
      : { startMs: c.startMs, endMs: c.endMs, en: otherText, zh: c.text };

  const lines: DraftLine[] = base.map((c, i) => make(c, attached[i]!.join(' ')));
  for (const c of standalone) {
    lines.push(
      enIsBase
        ? { startMs: c.startMs, endMs: c.endMs, en: '', zh: c.text }
        : { startMs: c.startMs, endMs: c.endMs, en: c.text, zh: '' },
    );
  }
  return lines.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

/**
 * 校时并生成集内序号：
 * 1. 整体平移 offsetMs，让库里的时间等于视频时间（手册 §4.3 S2）；
 * 2. 平移后起点为负的修正为 0，整条落在 0 之前或时长非正的丢弃，满足表上的 end > start 约束；
 * 3. 按开始时间排序，idx 从 0 连续递增。
 */
export function finalizeLines(drafts: DraftLine[], offsetMs = 0): Line[] {
  const shifted: DraftLine[] = [];
  for (const d of drafts) {
    const startMs = Math.max(0, d.startMs + offsetMs);
    const endMs = d.endMs + offsetMs;
    if (endMs <= startMs) continue;
    shifted.push({ ...d, startMs, endMs });
  }
  shifted.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return shifted.map((d, idx) => ({ idx, ...d }));
}
