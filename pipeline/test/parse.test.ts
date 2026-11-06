import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSubtitle } from '../src/srt/decode.js';
import { parseSrt, splitBilingual } from '../src/srt/parse.js';

test('解析：兼容 BOM、CRLF、点号时间戳、多行文本', () => {
  const text =
    '\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\nline one\r\nline two\r\n\r\n' +
    '2\r\n00:01:02.250 --> 00:01:03.5\r\nsecond\r\n';
  const { cues, skipped } = parseSrt(text);
  assert.equal(skipped, 0);
  assert.deepEqual(cues, [
    { startMs: 1500, endMs: 3000, text: 'line one\nline two' },
    { startMs: 62250, endMs: 63500, text: 'second' },
  ]);
});

test('解析：缺少序号行也能解析', () => {
  const { cues } = parseSrt('00:00:01,000 --> 00:00:02,000\nhello\n');
  assert.equal(cues.length, 1);
  assert.equal(cues[0]?.text, 'hello');
});

test('解析：坏块被跳过并计数，不影响其他条目', () => {
  const text = [
    '1\n00:00:01,000 --> 00:00:02,000\nok',
    '2\nnot a timestamp\nbroken',
    '3\n00:00:05,000 --> 00:00:04,000\nend before start',
    '4\n00:00:06,000 --> 00:00:07,000\nstill ok',
  ].join('\n\n');
  const { cues, skipped } = parseSrt(text);
  assert.equal(cues.length, 2);
  assert.equal(skipped, 2);
});

test('解析：文本为空的条目直接忽略', () => {
  const { cues } = parseSrt('1\n00:00:01,000 --> 00:00:02,000\n\n\n2\n00:00:03,000 --> 00:00:04,000\nx');
  assert.deepEqual(
    cues.map((c) => c.text),
    ['x'],
  );
});

test('双语拆分：按文字是否含中文归类，与行的先后顺序无关', () => {
  const zhFirst = splitBilingual([{ startMs: 0, endMs: 1000, text: '你好\nHello' }]);
  const enFirst = splitBilingual([{ startMs: 0, endMs: 1000, text: 'Hello\n你好' }]);
  assert.deepEqual(zhFirst, [{ startMs: 0, endMs: 1000, en: 'Hello', zh: '你好' }]);
  assert.deepEqual(enFirst, zhFirst);
});

test('双语拆分：只有单一语言的条目保留另一侧为空', () => {
  const out = splitBilingual([
    { startMs: 0, endMs: 1000, text: 'Only English' },
    { startMs: 2000, endMs: 3000, text: '只有中文' },
  ]);
  assert.equal(out[0]?.zh, '');
  assert.equal(out[1]?.en, '');
});

test('双语拆分：同一语言多行用空格拼接', () => {
  const out = splitBilingual([{ startMs: 0, endMs: 1000, text: '甲\n乙\nfirst\nsecond' }]);
  assert.equal(out[0]?.zh, '甲 乙');
  assert.equal(out[0]?.en, 'first second');
});

test('解码：UTF-8（带 BOM）', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xe4, 0xbd, 0xa0]);
  assert.equal(decodeSubtitle(bytes), '你');
});

test('解码：UTF-16LE（带 BOM）', () => {
  const bytes = new Uint8Array([0xff, 0xfe, 0x60, 0x4f, 0x61, 0x00]);
  assert.equal(decodeSubtitle(bytes), '你a');
});

test('解码：非 UTF-8 的字节回退到 GB18030', () => {
  // “你好”的 GBK 编码；这不是合法的 UTF-8
  const bytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);
  assert.equal(decodeSubtitle(bytes), '你好');
});
