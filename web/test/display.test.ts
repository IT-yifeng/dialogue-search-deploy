import { describe, expect, it } from 'vitest';
import { pickDisplayLines, pickEpisodeTitle } from '../src/lib/displayLines';
import { pageItems } from '../src/lib/pagination';

describe('pickDisplayLines', () => {
  const both = { en: 'Hello', zh: '你好' };

  it('双语模式按英、中顺序返回', () => {
    expect(pickDisplayLines(both, 'both').map((l) => l.lang)).toEqual(['en', 'zh']);
  });

  it('单语模式只返回所选语言', () => {
    expect(pickDisplayLines(both, 'zh')).toEqual([{ lang: 'zh', text: '你好', fallback: false }]);
  });

  it('所选语言为空时回退到另一种并标记 fallback', () => {
    expect(pickDisplayLines({ en: '', zh: '你好' }, 'en')).toEqual([
      { lang: 'zh', text: '你好', fallback: true },
    ]);
    expect(pickDisplayLines({ en: 'Hi', zh: '  ' }, 'zh')).toEqual([
      { lang: 'en', text: 'Hi', fallback: true },
    ]);
  });

  it('双语模式下缺失的一方不显示', () => {
    expect(pickDisplayLines({ en: 'Hi', zh: '' }, 'both')).toHaveLength(1);
  });

  it('两种都为空返回空数组', () => {
    expect(pickDisplayLines({ en: '', zh: '' }, 'both')).toEqual([]);
  });
});

describe('pickEpisodeTitle', () => {
  it('按模式取标题，缺失时回退', () => {
    expect(pickEpisodeTitle({ titleEn: 'T', titleZh: '标题' }, 'zh')).toBe('标题');
    expect(pickEpisodeTitle({ titleEn: 'T', titleZh: null }, 'zh')).toBe('T');
    expect(pickEpisodeTitle({ titleEn: 'T', titleZh: '标题' }, 'both')).toBe('T / 标题');
    expect(pickEpisodeTitle({ titleEn: null, titleZh: null }, 'both')).toBe('');
  });
});

describe('pageItems', () => {
  it('只有一页或没有结果时不显示分页', () => {
    expect(pageItems(1, 1)).toEqual([]);
    expect(pageItems(1, 0)).toEqual([]);
  });

  it('页数少时全部列出', () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
  });

  it('中间页两侧都有省略号', () => {
    expect(pageItems(10, 20)).toEqual([1, 'gap', 8, 9, 10, 11, 12, 'gap', 20]);
  });

  it('缺口只有一页时直接显示页码', () => {
    expect(pageItems(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('靠近首尾时只有一侧省略号', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 'gap', 20]);
    expect(pageItems(20, 20)).toEqual([1, 'gap', 18, 19, 20]);
  });
});
