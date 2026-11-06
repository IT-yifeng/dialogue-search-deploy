import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCues, cleanLine, mergeBrokenLines } from '../src/srt/clean.js';
import type { DraftLine } from '../src/types.js';

test('清洗：去 ASS 格式标记与 HTML 标签', () => {
  assert.equal(cleanLine('{\\fs16\\an2\\b0}你好'), '你好');
  assert.equal(cleanLine('<i>Hello</i> <b>there</b>'), 'Hello there');
});

test('清洗：去音效括号，中文括号译者注也一并去掉', () => {
  assert.equal(cleanLine('[laughs] Fine.'), 'Fine.');
  assert.equal(cleanLine('(sighs)'), '');
  assert.equal(cleanLine('（笑）'), '');
  assert.equal(cleanLine('这是熵(熵越大 系统越无序)'), '这是熵');
});

test('清洗：含 ♪ 的整行丢弃', () => {
  assert.equal(cleanLine('♪ la la la ♪'), '');
  assert.equal(cleanLine('♫ something'), '');
});

test('清洗：去说话人短横线与大写说话人标签', () => {
  assert.equal(cleanLine('- Who is there?'), 'Who is there?');
  assert.equal(cleanLine('— 谁在那儿？'), '谁在那儿？');
  assert.equal(cleanLine('JOHN: Hello'), 'Hello');
});

test('清洗：不会误伤正常句子里的冒号和连字符', () => {
  assert.equal(cleanLine('Note: this stays'), 'Note: this stays');
  assert.equal(cleanLine('well-known fact'), 'well-known fact');
});

test('清洗：去广告与字幕组水印', () => {
  assert.equal(cleanLine('Subtitles by Example Team'), '');
  assert.equal(cleanLine('www.example.com'), '');
  assert.equal(cleanLine('字幕组出品'), '');
});

test('清洗：去中文广告水印（公众号、引流话术）', () => {
  assert.equal(cleanLine('欢迎关注 添加微信公众号：Example 获取更多剧集'), '');
  assert.equal(cleanLine('某某出品 必属精品'), '');
});

test('清洗：去行内说话人分隔的短横线（两个人的话写在同一行）', () => {
  assert.equal(cleanLine("It is fine. -I don't care."), "It is fine. I don't care.");
  assert.equal(cleanLine('好的 -跟我无关'), '好的 跟我无关');
});

test('清洗：行内短横线只在“空白 + 横线 + 字母/汉字”时才去，不误伤数字和连字符', () => {
  assert.equal(cleanLine('It was -5 degrees'), 'It was -5 degrees');
  assert.equal(cleanLine('a well-known fact'), 'a well-known fact');
  assert.equal(cleanLine('wait - what?'), 'wait - what?');
});

test('清洗：折叠多余空白', () => {
  assert.equal(cleanLine('  a   b  '), 'a b');
});

test('清洗：多行条目逐行清洗，空行被丢弃', () => {
  const out = cleanCues([{ startMs: 0, endMs: 1000, text: '- Who?\n[noise]\n- Me.' }]);
  assert.deepEqual(out, [{ startMs: 0, endMs: 1000, text: 'Who?\nMe.' }]);
});

test('清洗：清洗后为空的条目被丢弃', () => {
  const out = cleanCues([
    { startMs: 0, endMs: 1000, text: '[music]' },
    { startMs: 2000, endMs: 3000, text: 'Keep' },
  ]);
  assert.equal(out.length, 1);
});

test('清洗：相邻且文字完全相同的条目合并为一条', () => {
  const out = cleanCues([
    { startMs: 0, endMs: 1000, text: 'Same' },
    { startMs: 1050, endMs: 2000, text: 'Same' },
    { startMs: 5000, endMs: 6000, text: 'Same' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.endMs, 2000);
});

const d = (startMs: number, endMs: number, en: string, zh = ''): DraftLine => ({ startMs, endMs, en, zh });

test('合并断句：前句无句末标点、间隔很短、后句小写开头 → 合并', () => {
  const out = mergeBrokenLines([d(0, 1000, 'We should take the', '甲'), d(1100, 2000, 'long way home.', '乙')]);
  assert.deepEqual(out, [d(0, 2000, 'We should take the long way home.', '甲 乙')]);
});

test('合并断句：前句已以句末标点结束 → 不合并', () => {
  const out = mergeBrokenLines([d(0, 1000, 'Done.'), d(1100, 2000, 'and then')]);
  assert.equal(out.length, 2);
});

test('合并断句：省略号结尾视为句末 → 不合并', () => {
  assert.equal(mergeBrokenLines([d(0, 1000, 'Well...'), d(1100, 2000, 'maybe')]).length, 2);
});

test('合并断句：间隔太长 → 不合并', () => {
  assert.equal(mergeBrokenLines([d(0, 1000, 'We should'), d(2000, 3000, 'go')]).length, 2);
});

test('合并断句：后句大写开头 → 不合并（可能是新句子或人名）', () => {
  assert.equal(mergeBrokenLines([d(0, 1000, 'I told'), d(1100, 2000, 'Leonard so')]).length, 2);
});

test('合并断句：合并后超过 8 秒 → 不合并', () => {
  assert.equal(mergeBrokenLines([d(0, 5000, 'we went to'), d(5100, 9000, 'the store')]).length, 2);
});

test('合并断句：任一侧英文为空 → 不合并', () => {
  assert.equal(mergeBrokenLines([d(0, 1000, '', '只有中文'), d(1100, 2000, 'lowercase')]).length, 2);
});

test('合并断句：可以连续合并多条', () => {
  const out = mergeBrokenLines([d(0, 1000, 'a'), d(1100, 2000, 'b'), d(2100, 3000, 'c.')]);
  assert.deepEqual(out, [d(0, 3000, 'a b c.')]);
});
