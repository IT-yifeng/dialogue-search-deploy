// 口令门禁：校验签名 cookie。没有有效 cookie 的请求一律 401（手册 §6、§8.5）。
import type { Context, MiddlewareHandler } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { AppError } from '../lib/httpError.js';
import type { AuthService } from '../services/authService.js';

export const GATE_COOKIE = 'ds_gate';
/** 30 天（手册 §6） */
export const GATE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export interface GateSession {
  /** 登录成功后写入 cookie */
  issue(c: Context): Promise<void>;
  /** 请求是否带着有效 cookie */
  isValid(c: Context): Promise<boolean>;
}

export function createGateSession(auth: AuthService, opts: { secret: string; secure: boolean }): GateSession {
  return {
    async issue(c) {
      await setSignedCookie(c, GATE_COOKIE, auth.sessionToken, opts.secret, {
        path: '/',
        maxAge: GATE_MAX_AGE_SEC,
        // 脚本读不到 cookie，XSS 也偷不走登录态
        httpOnly: true,
        // Lax：站内跳转与从分享链接点进来都带 cookie，同时挡住跨站 POST
        sameSite: 'Lax',
        // 由配置决定而不是看请求协议：线上 HTTPS 在代理处终止，服务看到的请求是 http
        secure: opts.secure,
      });
    },
    async isValid(c) {
      // 签名不对返回 false，没带返回 undefined；值还要和当前口令派生的凭证一致，改口令后旧 cookie 作废
      const v = await getSignedCookie(c, opts.secret, GATE_COOKIE);
      return typeof v === 'string' && v === auth.sessionToken;
    },
  };
}

// 免口令白名单（手册 §6）。路径用严格的字符集匹配，而不是宽松的 [^/]+：
// 白名单越窄，路径写法上的花样（编码、点段）越不可能蹭过门禁。
const SHARE_READ = /^\/api\/shares\/[0-9A-Za-z]+$/;
const SHARE_PLAY = /^\/api\/shares\/[0-9A-Za-z]+\/lines\/\d+\/play$/;

export function isPublicRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (path === '/healthz') return true;
  if (path === '/api/auth') return m === 'POST';
  // 分享链接本身就是凭证；只开放“读”，创建分享（POST /api/shares）仍需口令
  if (m === 'GET' || m === 'HEAD') return SHARE_READ.test(path) || SHARE_PLAY.test(path);
  return false;
}

export function createGate(session: GateSession): MiddlewareHandler {
  return async (c, next) => {
    if (isPublicRoute(c.req.method, c.req.path)) return next();
    if (!(await session.isValid(c))) throw new AppError(401, 'UNAUTHORIZED', '请先输入口令');
    return next();
  };
}
