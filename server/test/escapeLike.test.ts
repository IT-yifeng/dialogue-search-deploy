import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeLike, escapeRegex } from '../src/lib/escapeLike.js';

test('escapeLike：% _ \\ 被转义，普通字符与中文不变', () => {
  assert.equal(escapeLike('100%'), '100\\%');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('a\\b'), 'a\\\\b');
  assert.equal(escapeLike('%_\\'), '\\%\\_\\\\');
  assert.equal(escapeLike('penny 佩妮'), 'penny 佩妮');
});

test('escapeRegex：正则元字符被转义', () => {
  assert.equal(escapeRegex('a.b'), 'a\\.b');
  assert.equal(escapeRegex('(x)+[y]?'), '\\(x\\)\\+\\[y\\]\\?');
  assert.equal(escapeRegex('a|b^$'), 'a\\|b\\^\\$');
  assert.equal(escapeRegex('plain'), 'plain');
});
