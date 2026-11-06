import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignCues, finalizeLines } from '../src/srt/align.js';
import type { Cue, DraftLine } from '../src/types.js';

const c = (startMs: number, endMs: number, text: string): Cue => ({ startMs, endMs, text });

test('对齐：时间一一对应', () => {
  const out = alignCues([c(0, 1000, 'a'), c(2000, 3000, 'b')], [c(0, 1000, '甲'), c(2000, 3000, '乙')]);
  assert.deepEqual(out, [
    { startMs: 0, endMs: 1000, en: 'a', zh: '甲' },
    { startMs: 2000, endMs: 3000, en: 'b', zh: '乙' },
  ]);
});

test('对齐：时间有轻微错位仍能配上', () => {
  const out = alignCues([c(1000, 3000, 'a')], [c(1200, 3300, '甲')]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.zh, '甲');
});

test('对齐：多条副语言字幕落在同一条主语言内 → 按时间顺序拼接', () => {
  const out = alignCues([c(0, 4000, 'one sentence'), c(5000, 6000, 'x'), c(7000, 8000, 'y')], [c(0, 1800, '前半'), c(2000, 4000, '后半'), c(5000, 6000, '甲')]);
  assert.equal(out[0]?.zh, '前半 后半');
  assert.equal(out[1]?.zh, '甲');
  assert.equal(out[2]?.zh, '');
});

test('对齐：一条副语言字幕跨两条主语言 → 只归给重叠更大的一条，不重复', () => {
  const out = alignCues([c(0, 1000, 'a'), c(1000, 3000, 'b'), c(4000, 5000, 'c')], [c(500, 3000, '跨')]);
  const withZh = out.filter((l) => l.zh === '跨');
  assert.equal(withZh.length, 1);
  assert.equal(withZh[0]?.en, 'b');
});

test('对齐：重叠比例不足的副语言字幕独立成行，不丢台词', () => {
  const out = alignCues([c(0, 1000, 'a')], [c(900, 5000, '几乎不重叠')]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], { startMs: 900, endMs: 5000, en: '', zh: '几乎不重叠' });
});

test('对齐：完全没有重叠的副语言字幕独立成行，并保持时间顺序', () => {
  const out = alignCues([c(0, 1000, 'a'), c(5000, 6000, 'b')], [c(2000, 3000, '中间')]);
  assert.deepEqual(
    out.map((l) => [l.en, l.zh]),
    [
      ['a', ''],
      ['', '中间'],
      ['b', ''],
    ],
  );
});

test('对齐：中文条数更多时以中文为主，同样不丢条目', () => {
  // “whole” 与“前”重叠 2200ms、与“后”重叠 1600ms → 归给重叠更大的“前”
  const out = alignCues([c(0, 4000, 'whole')], [c(0, 2200, '前'), c(2400, 4000, '后')]);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.en, 'whole');
  assert.equal(out[1]?.en, '');
  assert.deepEqual(
    out.map((l) => l.zh),
    ['前', '后'],
  );
});

test('对齐：任一侧为空', () => {
  assert.deepEqual(alignCues([], [c(0, 1000, '甲')]), [{ startMs: 0, endMs: 1000, en: '', zh: '甲' }]);
  assert.deepEqual(alignCues([c(0, 1000, 'a')], []), [{ startMs: 0, endMs: 1000, en: 'a', zh: '' }]);
  assert.deepEqual(alignCues([], []), []);
});

const d = (startMs: number, endMs: number): DraftLine => ({ startMs, endMs, en: 'x', zh: '' });

test('生成 idx：按开始时间排序，idx 从 0 连续递增', () => {
  const out = finalizeLines([d(5000, 6000), d(1000, 2000), d(3000, 4000)]);
  assert.deepEqual(
    out.map((l) => [l.idx, l.startMs]),
    [
      [0, 1000],
      [1, 3000],
      [2, 5000],
    ],
  );
});

test('校时：整体平移时间戳', () => {
  const out = finalizeLines([d(1000, 2000)], 1500);
  assert.deepEqual([out[0]?.startMs, out[0]?.endMs], [2500, 3500]);
});

test('校时：负偏移后起点小于 0 的修正为 0，完全移出范围的丢弃', () => {
  const out = finalizeLines([d(500, 3000), d(100, 800), d(5000, 6000)], -1000);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0]?.startMs, out[0]?.endMs], [0, 2000]);
  assert.deepEqual([out[1]?.startMs, out[1]?.endMs], [4000, 5000]);
});

test('生成 idx：保证每条 end > start', () => {
  const out = finalizeLines([d(1000, 1000), d(2000, 1500), d(3000, 4000)]);
  assert.equal(out.length, 1);
  assert.ok(out.every((l) => l.endMs > l.startMs));
});
