import { describe, expect, it } from 'vitest';
import { isSameOriginPlayUrl } from '../src/lib/corsExportVideo';

describe('isSameOriginPlayUrl', () => {
  it('相对路径视为同源', () => {
    expect(isSameOriginPlayUrl('/media/tbbt/S01E01.mp4')).toBe(true);
  });

  it('外域预签名为跨域', () => {
    expect(isSameOriginPlayUrl('https://example.r2.cloudflarestorage.com/bucket/key?sig=1')).toBe(false);
  });
});
