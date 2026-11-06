import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEpisode, formatTimestamp, renderReport, type QaRow } from '../src/qa.js';

const row = (idx: number, startMs: number, endMs: number, en = 'e', zh = 'z'): QaRow => ({ idx, startMs, endMs, en, zh });

test('QA：全部合格的一集', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(i, i * 2000, i * 2000 + 1500));
  // 最后一条台词结束于 18.5s，视频 25s：台词在视频内，且差距远小于 5 分钟
  const r = analyzeEpisode('S01E01', rows, 25_000);
  assert.equal(r.lineCount, 10);
  assert.equal(r.bothRatio, 1);
  assert.deepEqual(r.problems, []);
});

test('QA：中英都有的占比低于 90% 要告警', () => {
  const rows = [...Array.from({ length: 8 }, (_, i) => row(i, i * 2000, i * 2000 + 1000)), row(8, 20000, 21000, 'e', ''), row(9, 22000, 23000, '', 'z')];
  const r = analyzeEpisode('S01E01', rows, null);
  assert.equal(r.bothRatio, 0.8);
  assert.ok(r.problems.some((p) => p.includes('90%')));
});

test('QA：开始时间倒退要告警；仅重叠只计数不告警', () => {
  const back = analyzeEpisode('S01E01', [row(0, 5000, 6000), row(1, 1000, 2000)], null);
  assert.equal(back.nonMonotonic, 1);
  assert.ok(back.problems.some((p) => p.includes('递增')));

  const overlap = analyzeEpisode('S01E01', [row(0, 1000, 3000), row(1, 2000, 4000)], null);
  assert.equal(overlap.overlaps, 1);
  assert.equal(overlap.problems.length, 0);
});

test('QA：负时长或零时长要告警', () => {
  const r = analyzeEpisode('S01E01', [row(0, 2000, 2000)], null);
  assert.equal(r.badDuration, 1);
  assert.ok(r.problems.some((p) => p.includes('时长')));
});

test('QA：台词超出视频时长要告警', () => {
  const r = analyzeEpisode('S01E01', [row(0, 1000, 700_000)], 600_000);
  assert.ok(r.problems.some((p) => p.includes('超出视频')));
});

test('QA：字幕结尾与视频时长相差太大，提示版本可能不匹配', () => {
  const r = analyzeEpisode('S01E01', [row(0, 1000, 60_000)], 1_300_000);
  assert.ok(r.problems.some((p) => p.includes('版本')));
});

test('QA：没有视频时不校验时长', () => {
  const r = analyzeEpisode('S01E01', [row(0, 1000, 2000)], null);
  assert.equal(r.deviationMs, null);
  assert.deepEqual(r.problems, []);
});

test('QA：没有台词本身就是问题', () => {
  assert.ok(analyzeEpisode('S01E01', [], null).problems.length > 0);
});

test('QA：抽查最多 5 条、都含中英、按顺序、同一集结果稳定', () => {
  const rows = Array.from({ length: 50 }, (_, i) => row(i, i * 2000, i * 2000 + 1000));
  const a = analyzeEpisode('S01E01', rows, null);
  const b = analyzeEpisode('S01E01', rows, null);
  assert.equal(a.samples.length, 5);
  assert.deepEqual(a.samples, b.samples);
  assert.deepEqual(
    a.samples.map((s) => s.idx),
    [...a.samples.map((s) => s.idx)].sort((x, y) => x - y),
  );
});

test('时间格式：不足一小时用 mm:ss，否则 h:mm:ss', () => {
  assert.equal(formatTimestamp(65_000), '01:05');
  assert.equal(formatTimestamp(3_725_000), '1:02:05');
});

test('报告：有问题的集明确标注“不合格”，汇总行给出数量', () => {
  const ok = analyzeEpisode('S01E01', [row(0, 0, 1000)], null);
  const bad = analyzeEpisode('S01E02', [], null);
  const md = renderReport([ok, bad], new Date('2026-01-01T00:00:00Z'));
  assert.ok(md.includes('S01E01'));
  assert.ok(md.includes('不合格'));
  assert.ok(md.includes('1 / 2'));
});
