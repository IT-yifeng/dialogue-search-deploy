import { describe, expect, it } from 'vitest';
import { formatEpisodeCode, formatTime } from '../src/lib/formatTime';

describe('formatTime', () => {
  it('毫秒转 mm:ss，向下取整', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(723_999)).toBe('12:03');
  });

  it('超过一小时带小时位', () => {
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });

  it('负数按 0 处理', () => {
    expect(formatTime(-500)).toBe('00:00');
  });
});

describe('formatEpisodeCode', () => {
  it('季集补零', () => {
    expect(formatEpisodeCode(2, 5)).toBe('S02E05');
    expect(formatEpisodeCode(12, 24)).toBe('S12E24');
  });
});
