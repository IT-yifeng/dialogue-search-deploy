// POST /api/auth：口令换 cookie。限流由挂载处（index.ts）统一加在前面。
import { Hono } from 'hono';
import { AppError, badRequest } from '../lib/httpError.js';
import type { GateSession } from '../middleware/gate.js';
import type { AuthService } from '../services/authService.js';

/** 口令长度上限：只为挡掉超大请求体，真实口令不会这么长 */
const MAX_PASSCODE_LENGTH = 200;

export function createAuthRoutes(auth: AuthService, session: GateSession): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    const body: unknown = await c.req.json().catch(() => {
      throw badRequest('请求体不是合法的 JSON');
    });
    const passcode = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).passcode : undefined;
    if (typeof passcode !== 'string' || passcode === '' || passcode.length > MAX_PASSCODE_LENGTH) {
      throw badRequest('passcode 必须是非空字符串');
    }

    if (!auth.verifyPasscode(passcode)) {
      throw new AppError(401, 'INVALID_PASSCODE', '口令不正确');
    }
    await session.issue(c);
    // 登录结果不能被缓存
    c.header('Cache-Control', 'no-store');
    return c.json({ ok: true });
  });

  return app;
}
