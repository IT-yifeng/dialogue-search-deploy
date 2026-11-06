import { describe, expect, it } from 'vitest';
import { clipWindow } from '../src/lib/clipWindow';

describe('clipWindow', () => {
  it('前留 0.4s、后留 0.3s，单位转为秒', () => {
    expect(clipWindow(123_400, 125_900)).toEqual({ seekTo: 123, stopAt: 126.2 });
  });

  it('台词在片头附近时，起点不会小于 0', () => {
    expect(clipWindow(100, 900).seekTo).toBe(0);
    expect(clipWindow(0, 500)).toEqual({ seekTo: 0, stopAt: 0.8 });
  });

  it('起点恰好等于缓冲时为 0', () => {
    expect(clipWindow(400, 1000).seekTo).toBe(0);
  });
});
