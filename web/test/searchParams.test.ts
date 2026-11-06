import { describe, expect, it } from 'vitest';
import { buildSearchParams, parseSearchState } from '../src/lib/searchParams';

const parse = (qs: string) => parseSearchState(new URLSearchParams(qs));

describe('parseSearchState', () => {
  it('空查询串回退默认值', () => {
    expect(parse('')).toEqual({ q: '', season: undefined, page: 1 });
  });

  it('正常读取三个参数', () => {
    expect(parse('q=foo+bar&season=2&page=3')).toEqual({ q: 'foo bar', season: 2, page: 3 });
  });

  it('非法 page / season 回退默认', () => {
    expect(parse('q=a&page=abc&season=-1')).toEqual({ q: 'a', season: undefined, page: 1 });
    expect(parse('q=a&page=0&season=0')).toEqual({ q: 'a', season: undefined, page: 1 });
    expect(parse('q=a&page=1e2&season=0x10')).toEqual({ q: 'a', season: undefined, page: 1 });
    expect(parse('q=a&page=999999999')).toEqual({ q: 'a', season: undefined, page: 1 });
  });

  it('q 去掉首尾空白，超过 50 个字符会被截断', () => {
    expect(parse('q=++x++').q).toBe('x');
    expect(Array.from(parse(`q=${'a'.repeat(80)}`).q)).toHaveLength(50);
  });
});

describe('buildSearchParams', () => {
  it('省略默认值', () => {
    expect(buildSearchParams({ q: 'foo', page: 1 }).toString()).toBe('q=foo');
    expect(buildSearchParams({ q: '', page: 1 }).toString()).toBe('');
  });

  it('写出全部参数，并正确编码特殊字符', () => {
    const qs = buildSearchParams({ q: 'a&b 中', season: 2, page: 3 }).toString();
    expect(parse(qs)).toEqual({ q: 'a&b 中', season: 2, page: 3 });
  });
});
