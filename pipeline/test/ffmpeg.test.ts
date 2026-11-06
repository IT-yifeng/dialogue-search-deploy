import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractSubArgs, buildTranscodeArgs } from '../src/ffmpeg.js';

test('转码参数：与手册 §4.3 的命令一致', () => {
  const args = buildTranscodeArgs('in.mkv', 'out.mp4', { audioMap: '0:a:m:language:eng' });
  const joined = args.join(' ');
  assert.ok(joined.includes('-map 0:v:0 -map 0:a:m:language:eng '));
  assert.ok(joined.includes('-vf scale=-2:480'));
  assert.ok(joined.includes('-c:v libx264 -crf 26 -preset slow'));
  assert.ok(joined.includes('-g 24 -keyint_min 24 -sc_threshold 0'));
  assert.ok(joined.includes('-c:a aac -b:a 96k -ac 2 -sn'));
  assert.ok(joined.includes('-movflags +faststart'));
  assert.equal(args.at(-1), 'out.mp4');
});

test('转码参数：可切换到更快的预设', () => {
  const args = buildTranscodeArgs('in.mkv', 'out.mp4', { audioMap: '0:a:0?', preset: 'veryfast' });
  assert.ok(args.join(' ').includes('-preset veryfast'));
});

test('转码参数：路径含空格和中文时仍是独立的一项（不经过 shell）', () => {
  const args = buildTranscodeArgs('/a b/剧 S01E01.mkv', '/c d/输出.mp4', { audioMap: '0:a:0?' });
  assert.equal(args[args.indexOf('-i') + 1], '/a b/剧 S01E01.mkv');
  assert.equal(args.at(-1), '/c d/输出.mp4');
});

test('抽取内封字幕：选第 N 条字幕流并输出 srt', () => {
  const args = buildExtractSubArgs('in.mkv', 'out.srt', 1);
  assert.deepEqual(args.slice(-5), ['-map', '0:s:1', '-c:s', 'srt', 'out.srt']);
});
