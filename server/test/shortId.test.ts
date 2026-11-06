import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShortId, shortId, SHORT_ID_LENGTH } from '../src/lib/shortId.js';

test('shortId：8 位 base62', () => {
  for (let i = 0; i < 200; i++) {
    const id = shortId();
    assert.equal(id.length, SHORT_ID_LENGTH);
    assert.match(id, /^[0-9A-Za-z]{8}$/);
  }
});

test('shortId：多次生成不会全部相同', () => {
  const set = new Set(Array.from({ length: 100 }, () => shortId()));
  assert.ok(set.size > 95);
});

test('isShortId：长度与字符集', () => {
  assert.equal(isShortId('aB3dE9xZ'), true);
  assert.equal(isShortId('aB3dE9x'), false);
  assert.equal(isShortId('aB3dE9xZ1'), false);
  assert.equal(isShortId('aB3dE9x-'), false);
  assert.equal(isShortId(''), false);
});
