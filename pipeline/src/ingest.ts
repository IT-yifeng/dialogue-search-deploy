import { readFileSync } from 'node:fs';
import path from 'node:path';
import { alignCues, finalizeLines } from './srt/align.js';
import { cleanCues, mergeBrokenLines } from './srt/clean.js';
import { decodeSubtitle } from './srt/decode.js';
import { parseSrt, splitBilingual } from './srt/parse.js';
import type { EpisodeSources } from './scan.js';
import type { Cue, DraftLine, Line } from './types.js';

export interface BuildOptions {
  /** 是否清洗（去标签、音效、广告并合并断句）；对应命令行 --clean */
  clean: boolean;
  /** 时间偏移量（毫秒），会直接平移进库里的时间戳 */
  offsetMs: number;
}

export interface EpisodeBuild {
  lines: Line[];
  stats: {
    lineCount: number;
    /** 中英都有的台词数 */
    bothCount: number;
    /** 解析时被跳过的坏块数 */
    skippedBlocks: number;
  };
  /** 给人看的提示，如“忽略了哪些文件” */
  notes: string[];
}

/**
 * 把一集的字幕文件变成可入库的台词。纯文件读取与内存计算，不碰数据库，
 * 因此 `ingest --dry-run` 和单测都能直接用它。
 *
 * 两条路径：
 *  - 中英合一：每条里已经有两种语言，按汉字拆开即可，不需要对齐；
 *  - 中英分开：分别解析，英文先合并断句，再按时间重叠对齐。
 * 同时存在时以中英合一为准——它的配对来自字幕制作者，比我们按时间猜的更可靠。
 */
export function buildEpisodeLines(src: EpisodeSources, opts: BuildOptions): EpisodeBuild {
  const notes: string[] = [];
  let skippedBlocks = 0;

  const readCues = (file: string): Cue[] => {
    const { cues, skipped } = parseSrt(decodeSubtitle(readFileSync(file)));
    skippedBlocks += skipped;
    return opts.clean ? cleanCues(cues) : cues;
  };
  // 单语字幕里的多行只是同一条的换行，压成一行再对齐
  const flatten = (cues: Cue[]): Cue[] => cues.map((c) => ({ ...c, text: c.text.replace(/\s*\n\s*/g, ' ') }));

  let drafts: DraftLine[];
  if (src.bilingual) {
    const ignored = [src.en, src.zh].filter((f): f is string => Boolean(f));
    if (ignored.length > 0) {
      notes.push(`已有中英合一字幕，忽略单语文件：${ignored.map((f) => path.basename(f)).join('、')}`);
    }
    drafts = splitBilingual(readCues(src.bilingual));
    if (opts.clean) drafts = mergeBrokenLines(drafts);
  } else if (src.en || src.zh) {
    let en = src.en ? flatten(readCues(src.en)) : [];
    const zh = src.zh ? flatten(readCues(src.zh)) : [];
    if (opts.clean) {
      // 合并断句只作用在英文上（中文字幕通常没有标点，无法可靠判断）。
      // 合并后的时间跨度更大，对齐时中文更容易整句落进来。
      en = mergeBrokenLines(en.map((c) => ({ startMs: c.startMs, endMs: c.endMs, en: c.text, zh: '' }))).map((d) => ({
        startMs: d.startMs,
        endMs: d.endMs,
        text: d.en,
      }));
    }
    drafts = alignCues(en, zh);
  } else {
    throw new Error(`${src.id} 没有可用的字幕文件`);
  }

  const lines = finalizeLines(drafts, opts.offsetMs);
  return {
    lines,
    stats: {
      lineCount: lines.length,
      bothCount: lines.filter((l) => l.en !== '' && l.zh !== '').length,
      skippedBlocks,
    },
    notes,
  };
}
