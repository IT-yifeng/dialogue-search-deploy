import { describe, expect, it } from 'vitest';
import { lineAtTimeMs } from './lineAtTime';

describe('lineAtTimeMs', () => {
  const lines = [
    { id: 1, idx: 1, startMs: 1000, endMs: 2000, en: 'a', zh: '甲' },
    { id: 2, idx: 2, startMs: 2500, endMs: 3500, en: 'b', zh: '乙' },
  ];

  it('命中区间内', () => {
    expect(lineAtTimeMs(lines, 1500)?.en).toBe('a');
    expect(lineAtTimeMs(lines, 3000)?.en).toBe('b');
  });

  it('间隙内显示上一句', () => {
    expect(lineAtTimeMs(lines, 2200)?.en).toBe('a');
  });
});
