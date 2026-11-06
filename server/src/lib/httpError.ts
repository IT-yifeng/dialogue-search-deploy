// 统一错误格式：{ "error": { "code": "...", "message": "..." } }（手册 §6）。
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** 业务层主动抛出的、可以安全告诉客户端的错误 */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);

/**
 * app.onError 的处理函数。
 * 非 AppError 的异常只在服务端打日志、对外统一返回 INTERNAL，
 * 避免把 SQL 报错、连接串等内部细节暴露给客户端。
 */
export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('[server] 未预期的错误：', err);
  return c.json({ error: { code: 'INTERNAL', message: '服务器内部错误' } }, 500);
}

/** app.notFound 的处理函数：未匹配的路由也使用统一错误格式 */
export function notFoundHandler(c: Context) {
  return c.json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }, 404);
}
