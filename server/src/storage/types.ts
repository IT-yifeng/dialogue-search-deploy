// 素材存储抽象。业务代码只依赖它，所以本地开发用文件夹、线上用 R2，
// 将来换成 MinIO / B2 只需新增一个实现。
export interface StorageDriver {
  /** 上传本地文件到存储，key 例如 "tbbt/S01E01.mp4" */
  put(key: string, localPath: string, contentType: string): Promise<void>;
  /** 判断对象是否存在，用于上传时跳过已传文件（幂等） */
  exists(key: string): Promise<boolean>;
  /** 返回浏览器可直接播放的 URL；R2 为带过期时间的预签名链接，local 为 /media/... */
  getPlayUrl(key: string, ttlSec: number): Promise<string>;
}
