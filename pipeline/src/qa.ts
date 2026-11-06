import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { episodeId } from './scan.js';

export interface QaRow {
  idx: number;
  startMs: number;
  endMs: number;
  en: string;
  zh: string;
}

export interface EpisodeQa {
  id: string;
  lineCount: number;
  bothCount: number;
  /** 中英都有的台词占比，0～1 */
  bothRatio: number;
  /** 开始时间比上一条还早的条数 */
  nonMonotonic: number;
  /** 与上一条时间重叠的条数（字幕里很常见，只统计不告警） */
  overlaps: number;
  /** 时长为零或负数的条数 */
  badDuration: number;
  lastEndMs: number;
  durationMs: number | null;
  /** 视频时长 - 最后一条台词结束时间；没有视频时为 null */
  deviationMs: number | null;
  /** 不合格原因；为空表示合格 */
  problems: string[];
  /** 供人工对着视频抽查的台词 */
  samples: QaRow[];
}

/** 手册 §4.4：中英都有的台词占比下限 */
const MIN_BOTH_RATIO = 0.9;
/** 允许台词略微超出视频时长的容差（毫秒） */
const OVERRUN_TOLERANCE_MS = 2000;
/** 字幕结尾与视频时长相差超过它，说明字幕大概率不是这个版本（片尾字幕最多几分钟） */
const MAX_END_DEVIATION_MS = 5 * 60 * 1000;
const SAMPLE_COUNT = 5;

/** 以集标识为种子的确定性随机数：同一集每次抽到同样的 5 条，方便反复核对。 */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSamples(id: string, rows: QaRow[]): QaRow[] {
  const pool = rows.filter((r) => r.en !== '' && r.zh !== '');
  const rand = seededRandom(id);
  // 部分 Fisher–Yates：只洗出前 SAMPLE_COUNT 个
  for (let i = 0; i < Math.min(SAMPLE_COUNT, pool.length); i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, SAMPLE_COUNT).sort((a, b) => a.idx - b.idx);
}

/** 分析一集。rows 需按 idx 升序。纯函数，便于单测。 */
export function analyzeEpisode(id: string, rows: QaRow[], durationMs: number | null): EpisodeQa {
  const lineCount = rows.length;
  const bothCount = rows.filter((r) => r.en !== '' && r.zh !== '').length;
  let nonMonotonic = 0;
  let overlaps = 0;
  let badDuration = 0;
  let lastEndMs = 0;
  rows.forEach((r, i) => {
    if (r.endMs <= r.startMs) badDuration++;
    lastEndMs = Math.max(lastEndMs, r.endMs);
    const prev = rows[i - 1];
    if (!prev) return;
    if (r.startMs < prev.startMs) nonMonotonic++;
    else if (r.startMs < prev.endMs) overlaps++;
  });

  const bothRatio = lineCount === 0 ? 0 : bothCount / lineCount;
  const deviationMs = durationMs === null ? null : durationMs - lastEndMs;

  const problems: string[] = [];
  if (lineCount === 0) problems.push('没有台词');
  else if (bothRatio < MIN_BOTH_RATIO) problems.push(`中英都有的比例 ${(bothRatio * 100).toFixed(1)}%，低于 90%`);
  if (nonMonotonic > 0) problems.push(`有 ${nonMonotonic} 处开始时间不是递增`);
  if (badDuration > 0) problems.push(`有 ${badDuration} 条时长为零或负数`);
  if (durationMs !== null && lineCount > 0) {
    if (lastEndMs > durationMs + OVERRUN_TOLERANCE_MS) {
      problems.push(`台词超出视频时长 ${((lastEndMs - durationMs) / 1000).toFixed(1)} 秒`);
    } else if (Math.abs(deviationMs!) > MAX_END_DEVIATION_MS) {
      problems.push(`字幕结尾与视频时长相差 ${(Math.abs(deviationMs!) / 60000).toFixed(1)} 分钟，字幕版本可能与视频不匹配`);
    }
  }

  return {
    id,
    lineCount,
    bothCount,
    bothRatio,
    nonMonotonic,
    overlaps,
    badDuration,
    lastEndMs,
    durationMs,
    deviationMs,
    problems,
    samples: pickSamples(id, rows),
  };
}

export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderReport(list: EpisodeQa[], generatedAt: Date): string {
  const passed = list.filter((e) => e.problems.length === 0).length;
  const out: string[] = [];
  out.push('# 语料质量报告', '');
  out.push(`生成时间：${generatedAt.toISOString()}`, '');
  out.push(`合格集数：${passed} / ${list.length}`, '');
  out.push('| 集 | 台词数 | 中英都有 | 视频时长 | 末条台词结束 | 差值 | 重叠条数 | 结论 |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const e of list) {
    const verdict = e.problems.length === 0 ? '合格' : '**不合格**';
    const dur = e.durationMs === null ? '无视频' : formatTimestamp(e.durationMs);
    const dev = e.deviationMs === null ? '-' : `${(e.deviationMs / 1000).toFixed(0)} 秒`;
    out.push(
      `| ${e.id} | ${e.lineCount} | ${(e.bothRatio * 100).toFixed(1)}%（${e.bothCount}） | ${dur} | ${formatTimestamp(e.lastEndMs)} | ${dev} | ${e.overlaps} | ${verdict} |`,
    );
  }

  const bad = list.filter((e) => e.problems.length > 0);
  if (bad.length > 0) {
    out.push('', '## 需要处理的问题', '');
    for (const e of bad) {
      out.push(`**${e.id}**`);
      for (const p of e.problems) out.push(`- ${p}`);
      out.push('');
    }
  }

  out.push('', '## 人工抽查', '');
  out.push('每集随机 5 条（同一集每次结果相同）。用播放器跳到对应时间，台词与画面口型相差不超过 1 秒即合格。', '');
  for (const e of list) {
    out.push(`### ${e.id}`, '');
    if (e.samples.length === 0) {
      out.push('（没有中英都有的台词可抽查）', '');
      continue;
    }
    out.push('| 时间点 | 英文 | 中文 |', '|---|---|---|');
    for (const s of e.samples) out.push(`| ${formatTimestamp(s.startMs)} | ${cell(s.en)} | ${cell(s.zh)} |`);
    out.push('');
  }
  return out.join('\n');
}

/** 从数据库读取全部集并生成报告（验证的是实际入库的内容，而不是中间文件）。 */
export async function runQa(client: pg.Client, outFile: string): Promise<EpisodeQa[]> {
  const eps = await client.query<{ id: number; season: number; episode: number; duration_ms: number | null }>(
    'SELECT id, season, episode, duration_ms FROM episodes ORDER BY season, episode',
  );
  const list: EpisodeQa[] = [];
  for (const ep of eps.rows) {
    const lines = await client.query<{ idx: number; start_ms: number; end_ms: number; en: string; zh: string }>(
      'SELECT idx, start_ms, end_ms, en, zh FROM lines WHERE episode_id = $1 ORDER BY idx',
      [ep.id],
    );
    const rows: QaRow[] = lines.rows.map((r) => ({ idx: r.idx, startMs: r.start_ms, endMs: r.end_ms, en: r.en, zh: r.zh }));
    list.push(analyzeEpisode(episodeId(ep), rows, ep.duration_ms));
  }
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderReport(list, new Date()));
  return list;
}
