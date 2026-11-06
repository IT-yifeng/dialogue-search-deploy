import { describe, expect, it } from 'vitest';
import { formatResultTotal } from '../src/lib/resultCount';

describe('formatResultTotal', () => {
  it('分段文案', () => {
    expect(formatResultTotal(100)).toBe('100 条结果');
    expect(formatResultTotal(5000)).toBe('5,000 条结果');
    expect(formatResultTotal(5001)).toBe('5,000+ 条结果');
    expect(formatResultTotal(30_000)).toBe('5,000+ 条结果');
    expect(formatResultTotal(30_001)).toBe('海量结果');
  });
});
