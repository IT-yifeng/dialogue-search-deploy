import type { Cue, DraftLine } from '../types.js';

// 时间戳行，如 00:00:01,500 --> 00:00:03,000；兼容点号和不足三位的毫秒
const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toMs(h: string, m: string, s: string, frac: string): number {
  // “.5” 表示 500ms，而不是 5ms，所以右侧补零
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(frac.padEnd(3, '0'));
}

export interface ParseResult {
  cues: Cue[];
  /** 无法解析（缺时间戳、结束早于开始）而被跳过的块数，供汇总时提示 */
  skipped: number;
}

/**
 * 解析 SRT 文本。
 * 不依赖序号行：字幕组常把序号写乱或漏写，只要有时间戳就能还原。
 * 坏块只跳过并计数，不让整集因为一处格式问题而失败。
 */
export function parseSrt(text: string): ParseResult {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  let skipped = 0;

  for (const block of normalized.split(/\n[ \t]*\n/)) {
    if (block.trim() === '') continue;
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => TIME_RE.test(l));
    if (timeIdx < 0) {
      skipped++;
      continue;
    }
    const m = TIME_RE.exec(lines[timeIdx]!)!;
    const startMs = toMs(m[1]!, m[2]!, m[3]!, m[4]!);
    const endMs = toMs(m[5]!, m[6]!, m[7]!, m[8]!);
    const body = lines
      .slice(timeIdx + 1)
      .join('\n')
      .trim();
    if (body === '') continue; // 空文本不算坏块，直接忽略
    if (endMs <= startMs) {
      skipped++;
      continue;
    }
    cues.push({ startMs, endMs, text: body });
  }
  return { cues, skipped };
}

// 中日韩统一表意文字（含扩展 A 区）。只要一行里出现，就认为这一行是中文
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;

/**
 * 把“中英合一”字幕的每条拆成 en / zh。
 * 按“这一行含不含汉字”归类，而不是按先后顺序：不同字幕组有的中文在上、有的英文在上。
 * 同一语言的多行用空格连接。
 */
export function splitBilingual(cues: Cue[]): DraftLine[] {
  const out: DraftLine[] = [];
  for (const cue of cues) {
    const en: string[] = [];
    const zh: string[] = [];
    for (const raw of cue.text.split('\n')) {
      const line = raw.trim();
      if (line === '') continue;
      (CJK_RE.test(line) ? zh : en).push(line);
    }
    if (en.length === 0 && zh.length === 0) continue;
    out.push({ startMs: cue.startMs, endMs: cue.endMs, en: en.join(' '), zh: zh.join(' ') });
  }
  return out;
}
