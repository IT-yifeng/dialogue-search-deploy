import { open } from 'node:fs/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import type { ObjectStore } from './upload.js';

/**
 * 单次 PUT 整集（约 100MB）时，本机代理会接住连接但不再转发，发送队列一直不下降。
 * 改成 8MB 分片：S3 要求除最后一片外每片至少 5MB，8MB 留有余量；每片单独超时，卡住就重试。
 */
const PART_SIZE = 8 * 1024 * 1024;
const PART_TIMEOUT_MS = 120_000;
const PART_ATTEMPTS = 3;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** 从环境变量读取 R2 凭据；缺哪个就明确说哪个，别等到上传时才得到一个看不懂的 403 */
export function readR2Config(env: NodeJS.ProcessEnv): R2Config {
  const pick = (name: string): string => {
    const v = env[name]?.trim();
    if (!v) throw new Error(`缺少 ${name}：上传到 R2 需要在 .env 里填写 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET`);
    return v;
  };
  return {
    accountId: pick('R2_ACCOUNT_ID'),
    accessKeyId: pick('R2_ACCESS_KEY_ID'),
    secretAccessKey: pick('R2_SECRET_ACCESS_KEY'),
    bucket: pick('R2_BUCKET'),
  };
}

export function createR2Store(cfg: R2Config, client?: S3Client): ObjectStore {
  const s3 =
    client ??
    new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // 与 server 的 R2Driver 一致：避免 SDK 默认追加的校验扩展被 R2 拒绝
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

  return {
    async head(key) {
      try {
        const res = await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return { size: res.ContentLength ?? -1 };
      } catch (e) {
        const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async put(key, localPath, size, contentType) {
      const created = await s3.send(
        new CreateMultipartUploadCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      const uploadId = created.UploadId;
      if (!uploadId) throw new Error(`R2 没有返回分片上传编号：${key}`);

      const total = Math.max(1, Math.ceil(size / PART_SIZE));
      const parts: { ETag: string; PartNumber: number }[] = [];
      const file = await open(localPath, 'r');
      try {
        let offset = 0;
        for (let partNumber = 1; offset < size; partNumber++) {
          const len = Math.min(PART_SIZE, size - offset);
          const buf = Buffer.allocUnsafe(len);
          const { bytesRead } = await file.read(buf, 0, len, offset);
          if (bytesRead !== len) throw new Error(`读取 ${localPath} 不完整：期望 ${len} 字节，得到 ${bytesRead}`);

          let etag: string | undefined;
          let lastError: unknown;
          for (let attempt = 1; attempt <= PART_ATTEMPTS && !etag; attempt++) {
            try {
              const res = await s3.send(
                new UploadPartCommand({
                  Bucket: cfg.bucket,
                  Key: key,
                  UploadId: uploadId,
                  PartNumber: partNumber,
                  Body: buf.subarray(0, bytesRead),
                  ContentLength: bytesRead,
                }),
                { abortSignal: AbortSignal.timeout(PART_TIMEOUT_MS) },
              );
              etag = res.ETag;
            } catch (e) {
              lastError = e;
            }
          }
          if (!etag) throw lastError instanceof Error ? lastError : new Error(String(lastError));

          parts.push({ ETag: etag, PartNumber: partNumber });
          offset += len;
          console.log(`[upload] ${key} 分片 ${partNumber}/${total}`);
        }

        await s3.send(
          new CompleteMultipartUploadCommand({
            Bucket: cfg.bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
          }),
          { abortSignal: AbortSignal.timeout(60_000) },
        );
      } catch (e) {
        // 未完成的分片会一直占着存储，失败时清掉，下次重跑从头传
        await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: key, UploadId: uploadId })).catch(() => {});
        throw e;
      } finally {
        await file.close();
      }
    },
  };
}
