import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { R2Config } from '../config.js';
import type { StorageDriver } from './types.js';

/**
 * Cloudflare R2 实现（S3 兼容）。桶保持私有，浏览器只拿得到带过期时间的预签名链接，
 * 视频流量由浏览器直连 R2，不经过我们的服务（R2 出站免费，也省下 Render 的带宽与内存）。
 */
export class R2Driver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  /** client 可注入，测试里用它替换网络调用；生产代码不传 */
  constructor(cfg: R2Config, client?: S3Client) {
    this.bucket = cfg.bucket;
    this.client =
      client ??
      new S3Client({
        region: 'auto', // R2 没有区域概念，SDK 要求填，固定写 auto
        endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
        // 新版 SDK 默认给请求追加 CRC32 校验与分块尾部；R2 对这些扩展的支持不稳定，
        // 只在协议要求时才计算，可以避免上传被拒或预签名链接带上多余参数
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
  }

  async put(key: string, localPath: string, contentType: string): Promise<void> {
    // 整集视频约 130MB，必须流式上传，不能读进内存；流式上传要求事先声明 ContentLength
    const { size } = await stat(localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      // 只有“对象不存在”才是 false；凭据错误、R2 故障等必须抛出去，
      // 否则会被伪装成“该集暂无视频”，排查起来完全找不到原因
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
  }

  async getPlayUrl(key: string, ttlSec: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSec });
  }
}
