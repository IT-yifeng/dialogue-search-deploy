// 样例文本均为自编，不含真实台词（项目规则：版权素材不进代码与测试）。
import { describe, expect, it } from 'vitest';
import { highlightSegments, splitTerms } from '../src/lib/highlight';

describe('splitTerms', () => {
  it('按空白切分，含全角空格', () => {
    expect(splitTerms('  foo   bar\u3000baz ')).toEqual(['foo', 'bar', 'baz']);
  });

  it('忽略大小写去重，保留首次出现的写法', () => {
    expect(splitTerms('Foo foo FOO bar')).toEqual(['Foo', 'bar']);
  });

  it('最多取前 5 个词', () => {
    expect(splitTerms('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('空输入返回空数组', () => {
    expect(splitTerms('   ')).toEqual([]);
  });
});

describe('highlightSegments', () => {
  it('英文忽略大小写命中，并保留原文大小写', () => {
    expect(highlightSegments('Hello World', ['world'])).toEqual([
      { text: 'Hello ', hit: false },
      { text: 'World', hit: true },
    ]);
  });

  it('中文子串命中', () => {
    expect(highlightSegments('今天天气很好', ['天气'])).toEqual([
      { text: '今天', hit: false },
      { text: '天气', hit: true },
      { text: '很好', hit: false },
    ]);
  });

  it('同一个词多次出现都高亮', () => {
    const segs = highlightSegments('aXbXc', ['x']);
    expect(segs.filter((s) => s.hit)).toHaveLength(2);
  });

  it('相互重叠的关键词合并为一段', () => {
    expect(highlightSegments('abcd', ['ab', 'bc'])).toEqual([
      { text: 'abc', hit: true },
      { text: 'd', hit: false },
    ]);
  });

  it('没有命中时返回整段未高亮', () => {
    expect(highlightSegments('nothing here', ['zzz'])).toEqual([{ text: 'nothing here', hit: false }]);
  });

  it('正则特殊字符按字面匹配，不会报错或匹配一切', () => {
    expect(highlightSegments('a.*b (c)', ['.*'])).toEqual([
      { text: 'a', hit: false },
      { text: '.*', hit: true },
      { text: 'b (c)', hit: false },
    ]);
    expect(() => highlightSegments('f(x)', ['('])).not.toThrow();
  });

  it('HTML 标签只作为普通文本返回，不做任何解释', () => {
    const segs = highlightSegments('<img src=x onerror=alert(1)>', ['img']);
    expect(segs.map((s) => s.text).join('')).toBe('<img src=x onerror=alert(1)>');
  });

  it('空文本返回空数组', () => {
    expect(highlightSegments('', ['a'])).toEqual([]);
  });
});
