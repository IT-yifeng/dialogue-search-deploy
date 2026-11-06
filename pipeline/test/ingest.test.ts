import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildEpisodeLines } from '../src/ingest.js';
import { scanSubs } from '../src/scan.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

function pick(dir: string, id: string) {
  const found = scanSubs(path.join(FIXTURES, dir)).find((e) => e.id === id);
  assert.ok(found, `fixtures 里缺少 ${id}`);
  return found;
}

test('整集：中英分开 → 清洗、合并断句、对齐', () => {
  const { lines } = buildEpisodeLines(pick('split', 'S01E01'), { clean: true, offsetMs: 0 });
  assert.deepEqual(
    lines.map((l) => [l.idx, l.startMs, l.endMs, l.en, l.zh]),
    [
      [0, 1000, 3000, 'The kettle is boiling.', '水壶烧开了。'],
      [1, 5200, 7000, 'Who is there? Just me.', '谁在那儿？ 只是我。'],
      [2, 10000, 13000, 'We should take the long way home.', '我们应该走远路回家。'],
      [3, 16000, 18000, 'Tomorrow will be better.', '明天会更好。'],
      [4, 22000, 23000, '', '这条只有中文。'],
    ],
  );
});

test('整集：双语合一 → 清洗并拆分，不依赖对齐', () => {
  const { lines } = buildEpisodeLines(pick('bilingual', 'S01E02'), { clean: true, offsetMs: 0 });
  assert.deepEqual(
    lines.map((l) => [l.idx, l.en, l.zh]),
    [
      [0, 'Good morning.', '早上好。'],
      [1, 'How are you?', '你好吗？'],
      [2, 'Only English here.', ''],
      [3, '', '只有中文在这。'],
      [4, 'Goodbye.', '再见'],
    ],
  );
});

test('整集：偏移量被直接平移进时间戳', () => {
  const { lines } = buildEpisodeLines(pick('bilingual', 'S01E02'), { clean: true, offsetMs: 2000 });
  assert.equal(lines[0]?.startMs, 3000);
  assert.equal(lines[0]?.endMs, 4500);
});

test('整集：不加 --clean 时保留原文（含格式标记），仍然拆分', () => {
  const { lines } = buildEpisodeLines(pick('bilingual', 'S01E02'), { clean: false, offsetMs: 0 });
  assert.ok(lines[0]?.zh.includes('{\\an8}'));
  assert.equal(lines[0]?.en, 'Good morning.');
});

test('整集：同时有双语合一与纯英文时，以双语合一为准并给出提示', () => {
  const src = { ...pick('bilingual', 'S01E02'), en: path.join(FIXTURES, 'split', 'S01E01.en.srt') };
  const { lines, notes } = buildEpisodeLines(src, { clean: true, offsetMs: 0 });
  assert.equal(lines[0]?.zh, '早上好。');
  assert.ok(notes.some((n) => n.includes('忽略')));
});

test('整集：统计信息可用于汇总打印', () => {
  const { stats } = buildEpisodeLines(pick('split', 'S01E01'), { clean: true, offsetMs: 0 });
  assert.equal(stats.lineCount, 5);
  assert.equal(stats.bothCount, 4);
  assert.equal(stats.skippedBlocks, 0);
});
