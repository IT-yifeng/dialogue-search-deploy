// fetch 封装：把后端统一的错误结构 { error: { code, message } } 转成 ApiError，
// 这样上层只需要处理一种异常，不用到处判断 res.ok。
import { getAnalyticsSessionId } from '../lib/analyticsSession';

export class ApiError extends Error {
  constructor(
    /** 后端错误码；网络层失败时为 NETWORK */
    readonly code: string,
    message: string,
    /** HTTP 状态码；网络层失败时为 0 */
    readonly status: number,
    /** 429 时来自 Retry-After（秒） */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * TanStack Query 的重试策略：4xx 是请求本身有问题（如关键词不合法），重试一百次结果也一样；
 * 网络错误和 5xx 可能是瞬时故障，只重试 1 次，别让用户等太久才看到错误条。
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

function sessionHeaders(): Record<string, string> {
  const id = getAnalyticsSessionId();
  return id ? { 'X-Session-Id': id } : {};
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...sessionHeaders(), ...init.headers },
    });
  } catch (err) {
    // 主动取消（切换关键词时 Query 会取消旧请求）要原样抛出，不能当成“网络错误”展示
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK', '无法连接服务器', 0);
  }

  if (!res.ok) {
    // 后端挂了时网关可能返回 HTML，解析失败就退回通用文案
    const body = (await res.json().catch(() => null)) as ErrorBody | null;
    const retryRaw = res.headers.get('Retry-After');
    const retryAfter = retryRaw !== null ? Number(retryRaw) : undefined;
    throw new ApiError(
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `请求失败（${res.status}）`,
      res.status,
      retryAfter !== undefined && Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

export function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
