// POST /api/shares、GET /api/shares/:id、GET /api/shares/:id/lines/:lineId/play。
// 只做参数校验与返回格式，业务交给 shareService。
//
// 门禁约定（M6 接入 gate 中间件时遵守）：
//   POST 需要口令；两个 GET 免口令，凭分享链接访问（手册 §6）。
import { Hono } from 'hono';
import { badRequest, notFound } from '../lib/httpError.js';
import { parseOptionalInt } from '../lib/queryParams.js';
import { isShortId } from '../lib/shortId.js';
import type { ShareService } from '../services/shareService.js';

/** 不合法的 ID 不可能存在，按“已失效”处理，比 400 更贴近用户看到的含义 */
function parseShareId(raw: string | undefined): string {
  if (raw === undefined || !isShortId(raw)) throw notFound('分享不存在或已失效');
  return raw;
}

function parseLineId(raw: string | undefined): number {
  const id = parseOptionalInt(raw, { name: 'lineId', min: 1, max: Number.MAX_SAFE_INTEGER });
  if (id === undefined) throw badRequest('lineId 必须是正整数');
  return id;
}

interface CreateBody {
  lineIds: number[];
  note?: string | null;
}

/** 只校验“类型”；数量上限、留言长度、台词是否存在属于业务规则，交给 service */
function parseCreateBody(body: unknown): CreateBody {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('请求体必须是 JSON 对象');
  }
  const { lineIds, note } = body as Record<string, unknown>;
  if (!Array.isArray(lineIds)) throw badRequest('lineIds 必须是数组');
  // 逐项检查：要求正的安全整数，避免精度丢失后分享到别的台词，或把字符串交给 bigint[] 触发数据库报错
  if (!lineIds.every((x): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 1)) {
    throw badRequest('lineIds 的每一项必须是正整数');
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    throw badRequest('note 必须是字符串');
  }
  return { lineIds, note: note as string | null | undefined };
}

export function createSharesRoutes(service: ShareService): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    const raw: unknown = await c.req.json().catch(() => {
      throw badRequest('请求体不是合法的 JSON');
    });
    return c.json(await service.create(parseCreateBody(raw)), 201);
  });

  app.get('/:id', async (c) => {
    const id = parseShareId(c.req.param('id'));
    // 读取会计浏览量，不能被缓存，否则统计失真
    c.header('Cache-Control', 'no-store');
    return c.json(await service.get(id));
  });

  app.get('/:id/lines/:lineId/play', async (c) => {
    const id = parseShareId(c.req.param('id'));
    const lineId = parseLineId(c.req.param('lineId'));
    // 播放链接带有时效，不能被缓存
    c.header('Cache-Control', 'no-store');
    return c.json(await service.getPlay(id, lineId));
  });

  return app;
}
