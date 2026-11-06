// GET/HEAD /media/*：本地开发时提供视频文件（STORAGE_DRIVER=local）。
// 线上用 R2 预签名链接，浏览器直连 R2，不经过这里。
// 必须支持 Range：浏览器拖动进度条、跳到片段起点都靠 Range 请求，
// 不支持的话 <video> 只能从头下载，“点播放跳到 12:03”会变得很慢甚至失败。
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { notFound } from '../lib/httpError.js';
import { parseRange } from '../lib/parseRange.js';
import type { LocalDriver } from '../storage/localDriver.js';

const PREFIX = '/media/';

/** 把 URL 里的路径还原成存储 key；解码失败或为空都按“不存在”处理，不暴露细节 */
function keyFromPath(path: string): string {
  try {
    const key = decodeURIComponent(path.slice(PREFIX.length));
    if (key !== '') return key;
  } catch {
    // 非法的百分号编码，落到下面的 notFound
  }
  throw notFound('视频不存在');
}

export function createMediaRoutes(driver: LocalDriver): Hono {
  const app = new Hono();

  // Hono 会让 HEAD 请求复用 GET 处理器并丢弃响应体，所以这里只注册 get
  app.get('/*', async (c) => {
    const key = keyFromPath(c.req.path);

    let file: string;
    let size: number;
    try {
      // resolvePath 内部已防路径穿越；非法 key 会抛错，统一当作不存在
      file = driver.resolvePath(key);
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not a file');
      size = st.size;
    } catch {
      throw notFound('视频不存在');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      // 本地文件可能被重新转码覆盖，开发时宁可每次校验，也不要播到旧版本
      'Cache-Control': 'no-cache',
    };

    const range = parseRange(c.req.header('Range'), size);
    if (range.kind === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }

    const partial = range.kind === 'partial';
    const start = partial ? range.start : 0;
    const end = partial ? range.end : size - 1;
    headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1);
    if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

    // 空文件不能传 start/end（end=-1 会让 createReadStream 报错），直接给空体
    if (size === 0) return new Response(null, { status: 200, headers });

    // 流式输出：整集 130MB 不能读进内存；客户端中途断开（拖动进度条）时流会被取消并释放文件句柄
    const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new Response(body, { status: partial ? 206 : 200, headers });
  });

  return app;
}
