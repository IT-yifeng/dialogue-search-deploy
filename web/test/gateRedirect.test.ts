import { describe, expect, it } from 'vitest';
import { gatePathFor, sanitizeNext } from '../src/lib/gateRedirect';

describe('sanitizeNext', () => {
  it('站内路径原样放行（含查询串）', () => {
    expect(sanitizeNext('/')).toBe('/');
    expect(sanitizeNext('/?q=hello&page=2')).toBe('/?q=hello&page=2');
    expect(sanitizeNext('/s/aB3dE9xZ')).toBe('/s/aB3dE9xZ');
  });

  it('缺省、空值回到首页', () => {
    expect(sanitizeNext(null)).toBe('/');
    expect(sanitizeNext(undefined)).toBe('/');
    expect(sanitizeNext('')).toBe('/');
  });

  it('拒绝外部地址与协议相对地址（开放重定向）', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'evil.com', '\\\\evil.com']) {
      expect(sanitizeNext(bad), bad).toBe('/');
    }
  });

  it('不回到口令页自身', () => {
    for (const p of ['/gate', '/gate?next=%2F', '/gate/x']) expect(sanitizeNext(p), p).toBe('/');
  });
});

describe('gatePathFor', () => {
  it('把当前页面编码进 next', () => {
    expect(gatePathFor({ pathname: '/', search: '?q=a b&page=2' })).toBe(`/gate?next=${encodeURIComponent('/?q=a b&page=2')}`);
  });

  it('首页没有查询串时不带 next', () => {
    expect(gatePathFor({ pathname: '/', search: '' })).toBe('/gate');
  });

  it('已在口令页时不嵌套', () => {
    expect(gatePathFor({ pathname: '/gate', search: '?next=%2F' })).toBe('/gate');
  });

  it('往返一致：编码后的 next 经 URLSearchParams 解出来再 sanitize 得到原路径', () => {
    const gate = gatePathFor({ pathname: '/', search: '?q=bazinga&season=2' });
    const next = new URLSearchParams(gate.split('?')[1]).get('next');
    expect(sanitizeNext(next)).toBe('/?q=bazinga&season=2');
  });
});
