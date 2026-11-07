// 把 repo 的 frame_key 转成 API 的 thumbnailUrl；与播放链接一样用预签名 URL（R2）或 /media/（本地）。
import type { SearchHit } from '../repos/linesRepo.js';
import { cachedGetPlayUrl } from '../storage/presignCache.js';
import type { StorageDriver } from '../storage/types.js';

/** 与播放链接同量级：列表与分享可缓存数分钟，不必每次搜都重签 */
export const THUMBNAIL_URL_TTL_SEC = 3600;

export type SearchLineItem = Omit<SearchHit, 'frameKey'> & { thumbnailUrl: string | null };

export async function attachThumbnailUrls(hits: SearchHit[], storage: StorageDriver): Promise<SearchLineItem[]> {
  const need = hits.filter((h) => h.frameKey !== null && h.frameKey !== '');
  // 不对每个 key 再 HeadObject：缩略图由管线保证存在；少一半 R2 往返，discover/search 首屏更快
  const urls = await Promise.all(
    need.map(async (h) => {
      const key = h.frameKey!;
      try {
        return await cachedGetPlayUrl(storage, key, THUMBNAIL_URL_TTL_SEC);
      } catch {
        // R2 抖动或凭据问题时列表仍应返回台词，只是无缩略图
        return null;
      }
    }),
  );
  const byId = new Map<number, string | null>();
  need.forEach((h, i) => byId.set(h.id, urls[i]!));
  return hits.map((h) => {
    const { frameKey: _k, ...rest } = h;
    const thumbnailUrl = h.frameKey ? (byId.get(h.id) ?? null) : null;
    return { ...rest, thumbnailUrl };
  });
}
