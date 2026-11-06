import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '../src/lib/parseRange.js';

// 文件大小统一取 1000 字节，合法下标是 0..999

test('没带 Range：返回完整内容', () => {
  assert.deepEqual(parseRange(undefined, 1000), { kind: 'full' });
});

test('普通区间、开放区间、尾段', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { kind: 'partial', start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=500-', 1000), { kind: 'partial', start: 500, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { kind: 'partial', start: 900, end: 999 });
});

test('终点超出文件：截到末尾；尾段比文件还长：从头开始', () => {
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { kind: 'partial', start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', 1000), { kind: 'partial', start: 0, end: 999 });
});

test('起点落在文件之外：不可满足（416）', () => {
  assert.deepEqual(parseRange('bytes=1000-', 1000), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=2000-2100', 1000), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=-0', 1000), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=0-', 0), { kind: 'unsatisfiable' });
});

test('格式无法理解：忽略 Range，返回完整内容', () => {
  for (const h of ['', 'bytes=', 'bytes=-', 'bytes=abc-def', 'items=0-1', 'bytes=0-1,5-6', 'bytes=9-3']) {
    assert.deepEqual(parseRange(h, 1000), { kind: 'full' }, h);
  }
});

test('超出安全整数的下标不会被放行', () => {
  assert.deepEqual(parseRange('bytes=99999999999999999999-', 1000), { kind: 'unsatisfiable' });
});
