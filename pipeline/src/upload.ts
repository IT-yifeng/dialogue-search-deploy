// S5 上传的编排逻辑：与具体存储解耦，只依赖 ObjectStore 接口，所以可以用假存储做单测。
// 注意：pipeline 不能引用 server 的代码（手册 §3.2），所以这里不复用 server 的 R2Driver。

export interface ObjectStore {
  /** 对象不存在返回 null；其他错误（凭据、网络）必须抛出，不能当作“不存在”去覆盖 */
  head(key: string): Promise<{ size: number } | null>;
  put(key: string, localPath: string, size: number, contentType: string): Promise<void>;
}

export interface UploadItem {
  /** 存储里的对象键，如 tbbt/S01E01.mp4 */
  key: string;
  localPath: string;
  size: number;
  /** 默认 video/mp4；缩略图用 image/jpeg */
  contentType?: string;
}

export type UploadStatus = 'uploaded' | 'skipped' | 'failed';

export interface UploadResult {
  key: string;
  status: UploadStatus;
  /** failed 时的原因 */
  error?: string;
}

/**
 * 逐个上传，已存在且大小一致的跳过。
 * - “大小一致”而不只是“存在”：重新转码后同名文件内容变了，只看存在会让云端永远停留在旧版本。
 * - 单个文件失败不中断整批：几十个文件里一个网络抖动不该让前面的白传；失败的会汇总返回，重跑时已完成的会被跳过，
 *   所以整个流程可以随时中断、反复重跑（单文件上传是原子的，不会留下半截对象）。
 * - 串行上传：单个文件约 130MB，并发只会让带宽互相挤占，失败时也更难排查。
 */
export async function uploadAll(
  store: ObjectStore,
  items: UploadItem[],
  opts: { force?: boolean; onProgress?: (r: UploadResult, index: number, total: number) => void } = {},
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const [i, item] of items.entries()) {
    let result: UploadResult;
    try {
      const remote = opts.force ? null : await store.head(item.key);
      if (remote && remote.size === item.size) {
        result = { key: item.key, status: 'skipped' };
      } else {
        await store.put(item.key, item.localPath, item.size, item.contentType ?? 'video/mp4');
        result = { key: item.key, status: 'uploaded' };
      }
    } catch (e) {
      result = { key: item.key, status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
    results.push(result);
    opts.onProgress?.(result, i, items.length);
  }
  return results;
}
