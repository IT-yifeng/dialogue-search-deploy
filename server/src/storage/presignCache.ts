// 预签名 URL 与 exists 结果的进程内缓存：列表一次要签十多条缩略图，重复 HeadObject / Sign 会明显拖慢首屏。
import type { StorageDriver } from './types.js';

const presign = new Map<string, { url: string; expiresAtMs: number }>();
const existsCache = new Map<string, { ok: boolean; expiresAtMs: number }>();

/** 距过期不足该时间则重新签发，避免前端拿到即将失效的链接 */
const PRESIGN_REFRESH_BUFFER_MS = 120_000;
const EXISTS_TTL_MS = 10 * 60 * 1000;

export async function cachedGetPlayUrl(storage: StorageDriver, key: string, ttlSec: number): Promise<string> {
  const now = Date.now();
  const hit = presign.get(key);
  if (hit && hit.expiresAtMs > now + PRESIGN_REFRESH_BUFFER_MS) return hit.url;
  const url = await storage.getPlayUrl(key, ttlSec);
  presign.set(key, { url, expiresAtMs: now + ttlSec * 1000 });
  return url;
}

export async function cachedExists(storage: StorageDriver, key: string): Promise<boolean> {
  const now = Date.now();
  const hit = existsCache.get(key);
  if (hit && hit.expiresAtMs > now) return hit.ok;
  const ok = await storage.exists(key);
  existsCache.set(key, { ok, expiresAtMs: now + EXISTS_TTL_MS });
  return ok;
}
