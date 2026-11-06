import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { episodeId, loadOffsets, parseEpisodeFile, scanSubs, scanVideos } from '../src/scan.js';

test('文件名：识别季集与语言后缀', () => {
  assert.deepEqual(parseEpisodeFile('S01E01.en.srt'), { season: 1, episode: 1, lang: 'en' });
  assert.deepEqual(parseEpisodeFile('S01E01.zh.srt'), { season: 1, episode: 1, lang: 'zh' });
  assert.deepEqual(parseEpisodeFile('S01E01.srt'), { season: 1, episode: 1, lang: 'bilingual' });
});

test('文件名：带前缀、大小写不同、连字符后缀也能识别', () => {
  assert.deepEqual(parseEpisodeFile('Show Name s02e10-EN.srt'), { season: 2, episode: 10, lang: 'en' });
  assert.deepEqual(parseEpisodeFile('Show Name S02E10.srt'), { season: 2, episode: 10, lang: 'bilingual' });
  assert.deepEqual(parseEpisodeFile('x.S12E100.chs.srt'), { season: 12, episode: 100, lang: 'zh' });
});

test('文件名：认不出季集或后缀的返回 null', () => {
  assert.equal(parseEpisodeFile('readme.srt'), null);
  assert.equal(parseEpisodeFile('S01E01.weird-tag.srt'), null);
});

test('episodeId：季集补零', () => {
  assert.equal(episodeId({ season: 1, episode: 5 }), 'S01E05');
  assert.equal(episodeId({ season: 12, episode: 100 }), 'S12E100');
});

function withTmpDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'pipeline-scan-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('扫描字幕：同一集的多个文件归到一起，按季集排序', () => {
  withTmpDir((dir) => {
    for (const f of ['X S01E02.srt', 'X S01E01-EN.srt', 'X S01E01.srt', 'S01E03.en.srt', 'S01E03.zh.srt', 'notes.txt', 'junk.srt']) {
      writeFileSync(path.join(dir, f), '');
    }
    const out = scanSubs(dir);
    assert.deepEqual(
      out.map((e) => [e.id, Boolean(e.bilingual), Boolean(e.en), Boolean(e.zh)]),
      [
        ['S01E01', true, true, false],
        ['S01E02', true, false, false],
        ['S01E03', false, true, true],
      ],
    );
  });
});

test('扫描视频：只认视频扩展名', () => {
  withTmpDir((dir) => {
    for (const f of ['X S01E01.mkv', 'S01E02.mp4', 'S01E03.srt', 'S01E04.txt']) writeFileSync(path.join(dir, f), '');
    assert.deepEqual(
      scanVideos(dir).map((v) => v.id),
      ['S01E01', 'S01E02'],
    );
  });
});

test('扫描：目录不存在时返回空数组而不是抛错', () => {
  assert.deepEqual(scanSubs('/definitely/not/here'), []);
  assert.deepEqual(scanVideos('/definitely/not/here'), []);
});

test('偏移量文件：缺失返回空对象；内容必须是数字', () => {
  withTmpDir((dir) => {
    assert.deepEqual(loadOffsets(path.join(dir, 'offsets.json')), {});
    const good = path.join(dir, 'good.json');
    writeFileSync(good, JSON.stringify({ S01E01: -1500 }));
    assert.deepEqual(loadOffsets(good), { S01E01: -1500 });
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ S01E01: 'abc' }));
    assert.throws(() => loadOffsets(bad), /S01E01/);
  });
});
