import { postJson } from './client';

/** 用口令换取门禁 cookie；成功时浏览器会自动保存 Set-Cookie，前端不需要处理令牌 */
export function login(passcode: string, signal?: AbortSignal): Promise<{ ok: true }> {
  return postJson<{ ok: true }>('/api/auth', { passcode }, signal);
}
