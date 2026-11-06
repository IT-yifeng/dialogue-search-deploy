// 片段播放的业务层：判断“能不能播”，并向存储要一个浏览器可直接播放的 URL（手册 §6）。
// 只依赖 repo 与 StorageDriver 接口，不关心底层是本地文件夹还是 R2。
import { AppError, notFound } from '../lib/httpError.js';
import type { LinesRepo } from '../repos/linesRepo.js';
import type { StorageDriver } from '../storage/types.js';

/** 播放链接有效期：够看完一批结果，又不至于泄露后长期可用（手册 §6：1 小时） */
export const PLAY_URL_TTL_SEC = 3600;

export interface PlayResult {
  url: string;
  /** 台词本身的起止；前后缓冲由前端播放器负责，所以这里不做加减 */
  startMs: number;
  endMs: number;
  /** 链接过期时间，秒级时间戳 */
  expiresAt: number;
}

export interface PlayService {
  getPlay(lineId: number): Promise<PlayResult>;
}

/** 与 NOT_FOUND 区分开：前端据此显示“暂无视频”，而不是“台词不存在” */
const noVideo = () => new AppError(404, 'NO_VIDEO', '该集暂无视频');

export function createPlayService(
  lines: LinesRepo,
  storage: StorageDriver,
  // 时钟可注入，测试里 expiresAt 才能写成确定值
  now: () => number = Date.now,
): PlayService {
  return {
    async getPlay(lineId) {
      const info = await lines.findPlayInfo(lineId);
      if (!info) throw notFound('台词不存在');
      if (info.videoKey === null) throw noVideo();
      // 库里有 video_key 不代表文件真的在（可能还没上传或被删），
      // 提前拦下来，免得前端拿到链接后才在 <video> 里报一个看不懂的错
      if (!(await storage.exists(info.videoKey))) throw noVideo();

      const url = await storage.getPlayUrl(info.videoKey, PLAY_URL_TTL_SEC);
      return {
        url,
        startMs: info.startMs,
        endMs: info.endMs,
        expiresAt: Math.floor(now() / 1000) + PLAY_URL_TTL_SEC,
      };
    },
  };
}
