import { describe, expect, it } from 'vitest';
import { buildShareText, formatCitation, SERIES_TITLE } from '../src/lib/copyText';

// 自编样例，不使用真实台词
const line = (over: Partial<{ en: string; zh: string; startMs: number; season: number; episode: number }> = {}) => ({
  episode: { season: over.season ?? 2, episode: over.episode ?? 5 },
  startMs: over.startMs ?? 723_400,
  en: over.en ?? 'Sample line.',
  zh: over.zh ?? '样例台词。',
});

describe('formatCitation', () => {
  it('格式为「—— 《片名》SxxEyy mm:ss」', () => {
    expect(formatCitation(line())).toBe(`—— 《${SERIES_TITLE}》S02E05 12:03`);
  });

  it('超过一小时用 h:mm:ss', () => {
    expect(formatCitation(line({ startMs: 3_723_000 }))).toBe(`—— 《${SERIES_TITLE}》S02E05 1:02:03`);
  });
});

describe('buildShareText', () => {
  it('每条三行：英文、中文、出处', () => {
    expect(buildShareText([line()])).toBe(`Sample line.\n样例台词。\n—— 《${SERIES_TITLE}》S02E05 12:03`);
  });

  it('多条之间空一行，保持传入顺序', () => {
    const text = buildShareText([line({ en: 'A.', zh: '甲', season: 1, episode: 1, startMs: 1000 }), line({ en: 'B.', zh: '乙' })]);
    expect(text.split('\n\n')).toEqual([
      `A.\n甲\n—— 《${SERIES_TITLE}》S01E01 00:01`,
      `B.\n乙\n—— 《${SERIES_TITLE}》S02E05 12:03`,
    ]);
  });

  it('某一语言为空时省略那一行，不留空行；出处行始终存在', () => {
    expect(buildShareText([line({ zh: '' })])).toBe(`Sample line.\n—— 《${SERIES_TITLE}》S02E05 12:03`);
    expect(buildShareText([line({ en: '  ' })])).toBe(`样例台词。\n—— 《${SERIES_TITLE}》S02E05 12:03`);
    expect(buildShareText([line({ en: '', zh: '' })])).toBe(`—— 《${SERIES_TITLE}》S02E05 12:03`);
  });

  it('没有台词返回空串', () => {
    expect(buildShareText([])).toBe('');
  });
});
