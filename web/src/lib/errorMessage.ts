import { ApiError } from '../api/client';

/** 把 ApiError 转成对用户友好的短文案（M7 统一错误体验）。 */
export function formatApiErrorMessage(error: unknown, fallback = '服务出错了，请稍后重试'): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'RATE_LIMITED') {
    const sec = error.retryAfterSeconds;
    if (sec !== undefined && Number.isFinite(sec) && sec > 0) {
      return `${error.message}（约 ${Math.ceil(sec)} 秒后可重试）`;
    }
    return error.message;
  }
  if (error.code === 'NETWORK') return '无法连接服务器，请检查网络后重试';
  if (error.status >= 400 && error.status < 500 && error.message) return error.message;
  return fallback;
}

/** 是否适合展示「重试」按钮（4xx 业务错误一般不重试）。 */
export function canRetryApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.code === 'NETWORK') return true;
  if (error.status >= 500) return true;
  if (error.code === 'RATE_LIMITED') return true;
  return false;
}
