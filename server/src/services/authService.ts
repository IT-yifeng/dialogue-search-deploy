// 门禁的业务层：校验口令，并给出“已登录”cookie 里应该携带的凭证值。
// 这里不碰 cookie 与 HTTP（那是 middleware/gate 的事），所以可以脱离框架单测。
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface AuthService {
  /** 口令是否正确。内部用常量时间比较，不能因为“前几位对了”而泄露耗时差异 */
  verifyPasscode(input: string): boolean;
  /**
   * 写进 cookie 的凭证值，由口令派生。
   * 这样修改 SITE_PASSCODE 后，旧 cookie 里的值对不上，所有人需要重新登录——
   * 口令泄露后“改口令即踢人”是最直接的止损手段。
   */
  readonly sessionToken: string;
}

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();

export function createAuthService(opts: { passcode: string; cookieSecret: string }): AuthService {
  // 先各自哈希成定长再比较：timingSafeEqual 要求两边等长，直接比原文会因长度不同而提前抛错/泄露长度
  const expected = sha256(opts.passcode);
  // 用 HMAC 而不是裸哈希：cookie 的值会暴露给浏览器，裸哈希可以被拿去离线暴力破解口令，
  // 加上服务端密钥之后，没有密钥就无从猜起
  const sessionToken = createHmac('sha256', opts.cookieSecret).update(`gate:v1:${opts.passcode}`).digest('hex');

  return {
    verifyPasscode(input) {
      return timingSafeEqual(sha256(input), expected);
    },
    sessionToken,
  };
}
