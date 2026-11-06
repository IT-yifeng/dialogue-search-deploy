import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/lib/httpError.js';
import { MAX_QUERY_LENGTH, MAX_TERMS, normalizeQuery } from '../src/services/searchService.js';

test('normalizeQuery：按空白切词，含全角空格与首尾空白', () => {
  assert.deepEqual(normalizeQuery('  penny   sheldon '), ['penny', 'sheldon']);
  assert.deepEqual(normalizeQuery('佩妮\u3000谢尔顿'), ['佩妮', '谢尔顿']);
  assert.deepEqual(normalizeQuery('penny 佩妮'), ['penny', '佩妮']);
});

test('normalizeQuery：去重忽略大小写，保留首次出现的写法', () => {
  assert.deepEqual(normalizeQuery('Penny penny PENNY other'), ['Penny', 'other']);
});

test('normalizeQuery：最多取前 MAX_TERMS 个词', () => {
  const terms = normalizeQuery('a b c d e f g');
  assert.equal(terms.length, MAX_TERMS);
  assert.deepEqual(terms, ['a', 'b', 'c', 'd', 'e']);
});

test('normalizeQuery：通配符原样保留，转义交给 repo', () => {
  assert.deepEqual(normalizeQuery('%'), ['%']);
  assert.deepEqual(normalizeQuery('a_b \\'), ['a_b', '\\']);
});

test('normalizeQuery：空串与纯空白抛 400', () => {
  for (const bad of ['', '   ', '\u3000']) {
    assert.throws(
      () => normalizeQuery(bad),
      (e) => e instanceof AppError && e.status === 400 && e.code === 'BAD_REQUEST',
    );
  }
});

test('normalizeQuery：恰好 50 个字符通过，51 个抛 400；按字符而非码元计数', () => {
  assert.doesNotThrow(() => normalizeQuery('a'.repeat(MAX_QUERY_LENGTH)));
  assert.throws(() => normalizeQuery('a'.repeat(MAX_QUERY_LENGTH + 1)), AppError);
  // emoji 占 2 个 UTF-16 码元，但只算 1 个字符
  assert.doesNotThrow(() => normalizeQuery('😀'.repeat(MAX_QUERY_LENGTH)));
});
