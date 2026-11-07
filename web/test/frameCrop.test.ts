import { describe, expect, it } from 'vitest';
import { computeCropRect, maxHorizontalPan, presetAspectRatio } from '../src/lib/frameCrop';

describe('presetAspectRatio', () => {
  it('原画幅为 null', () => {
    expect(presetAspectRatio('original')).toBeNull();
  });
  it('竖屏预设', () => {
    expect(presetAspectRatio('3:4')).toBeCloseTo(0.75);
    expect(presetAspectRatio('9:16')).toBeCloseTo(9 / 16);
    expect(presetAspectRatio('1:1')).toBe(1);
  });
});

describe('computeCropRect', () => {
  const vw = 1920;
  const vh = 1080;

  it('原画幅覆盖全帧', () => {
    expect(computeCropRect(vw, vh, 'original', 0.5)).toEqual({ x: 0, y: 0, width: vw, height: vh });
  });

  it('3:4 竖裁：高度贴满，宽度居中', () => {
    const r = computeCropRect(vw, vh, '3:4', 0.5);
    expect(r.height).toBe(vh);
    expect(r.width).toBeCloseTo(vh * 0.75);
    expect(r.y).toBe(0);
    expect(r.x).toBeCloseTo((vw - r.width) / 2, 0);
  });

  it('panX=0 与 panX=1 水平位置不同', () => {
    const left = computeCropRect(vw, vh, '1:1', 0);
    const right = computeCropRect(vw, vh, '1:1', 1);
    expect(left.x).toBe(0);
    expect(right.x).toBeGreaterThan(left.x);
    expect(right.x + right.width).toBeCloseTo(vw, 0);
  });

  it('pan 超出范围会被夹紧', () => {
    const left = computeCropRect(vw, vh, '9:16', -1);
    const right = computeCropRect(vw, vh, '9:16', 2);
    const center = computeCropRect(vw, vh, '9:16', 0.5);
    expect(left.x).toBe(0);
    expect(right.x).toBeGreaterThan(center.x);
  });
});

describe('maxHorizontalPan', () => {
  it('原画幅不可平移', () => {
    expect(maxHorizontalPan(1920, 'original', 1080)).toBe(0);
  });
  it('与裁切宽一致时为 0', () => {
    const r = computeCropRect(100, 100, '1:1', 0);
    expect(r.width).toBe(100);
    expect(maxHorizontalPan(100, '1:1', 100)).toBe(0);
  });
});
