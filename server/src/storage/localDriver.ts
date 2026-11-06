import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { StorageDriver } from './types.js';

/**
 * 本地文件夹实现：本地开发用，不需要联网，也不需要 MinIO。
 *
 * key 与线上 R2 保持完全一致（如 "tbbt/S01E01.mp4"），这样库里的 video_key 在切到 R2 时不用改。
 * 代价是本地目录里没有 "tbbt/" 这一层（管线直接输出到 work/mp4/S01E01.mp4），
 * 所以这里只取 key 的最后一段作为文件名。
 */
export class LocalDriver implements StorageDriver {
  /**
   * @param rootDir   存放视频的目录，通常是 <仓库根>/work/mp4
   * @param urlPrefix getPlayUrl 返回的路径前缀；真正提供该路由的是 routes/media.ts
   */
  constructor(
    private readonly rootDir: string,
    private readonly urlPrefix = '/media',
  ) {}

  /**
   * key → 本地绝对路径。
   * key 最终会来自数据库、间接来自用户可控的数据，因此必须防路径穿越：
   * 含 ".."、绝对路径、反斜杠、空字节的 key 一律拒绝，再取最后一段，双重保险。
   * 设为公开是因为 /media 路由要拿到文件路径来做 Range 读取；它不在 StorageDriver 接口里，
   * 因为 R2 没有“本地路径”这个概念。
   */
  resolvePath(key: string): string {
    // 以 / 结尾的 key 指向“目录”而不是文件，basename 会把它悄悄变成目录名，所以要单独拒绝
    if (key === '' || key.includes('..') || key.includes('\\') || key.includes('\0') || key.startsWith('/') || key.endsWith('/')) {
      throw new Error(`非法的存储 key：${JSON.stringify(key)}`);
    }
    const name = path.posix.basename(key);
    if (name === '' || name === '.') throw new Error(`非法的存储 key：${JSON.stringify(key)}`);
    const full = path.join(this.rootDir, name);
    // 兜底校验：解析后的路径必须仍在根目录之内
    if (path.relative(this.rootDir, full).startsWith('..')) throw new Error(`非法的存储 key：${JSON.stringify(key)}`);
    return full;
  }

  async put(key: string, localPath: string, _contentType: string): Promise<void> {
    // 本地文件系统不需要 Content-Type，由 /media 路由按扩展名决定
    const dest = this.resolvePath(key);
    await mkdir(this.rootDir, { recursive: true });
    await copyFile(localPath, dest);
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolvePath(key))).isFile();
    } catch (e) {
      // 文件不存在是正常结果；key 非法则是调用方的 bug，要抛出来
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw e;
    }
  }

  async getPlayUrl(key: string, _ttlSec: number): Promise<string> {
    // 本地没有过期概念，ttlSec 被忽略；先校验 key，避免为非法 key 签出 URL
    this.resolvePath(key);
    return `${this.urlPrefix}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}
