// 8 位 base62 短 ID，用于分享链接（手册 §5：shares.id）。
import { randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHORT_ID_LENGTH = 8;

/**
 * 分享链接是“凭链接访问、免口令”的，ID 不能被猜出来，所以不用 Math.random。
 * randomInt 内部做了拒绝采样，62 个字符等概率，不会有“取模偏差”。
 */
export function shortId(length: number = SHORT_ID_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** 路由层用它在查库前先挡掉明显不合法的 ID */
export function isShortId(s: string): boolean {
  return s.length === SHORT_ID_LENGTH && /^[0-9A-Za-z]+$/.test(s);
}
