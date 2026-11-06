// 分享的业务层：校验数量与留言、生成短 ID、读取时还原用户的勾选顺序（手册 §6）。
// 这里不碰 SQL（交给 repos），也不碰 HTTP（交给 routes）。
import { badRequest, notFound } from '../lib/httpError.js';
import { shortId } from '../lib/shortId.js';
import type { LinesRepo, SearchHit } from '../repos/linesRepo.js';
import type { SharesRepo } from '../repos/sharesRepo.js';
import type { PlayResult, PlayService } from './playService.js';

/** 手册 §1 / §6：一次最多分享 20 条 */
export const SHARE_MAX_LINES = 20;
/** 手册 §5：留言 ≤ 100 字 */
export const SHARE_NOTE_MAX = 100;
/** 短 ID 有 62^8 种取值，冲突几乎不可能；重试几次只是兜底，不值得无限循环 */
const ID_RETRY = 5;

export interface CreateShareInput {
  lineIds: number[];
  note?: string | null;
}

export interface ShareView {
  id: string;
  note: string | null;
  createdAt: string;
  /** 顺序即用户勾选顺序；库里已不存在的台词会被略过 */
  items: SearchHit[];
}

export interface ShareService {
  create(input: CreateShareInput): Promise<{ id: string; url: string }>;
  get(id: string): Promise<ShareView>;
  /** 只有属于该分享的台词才会被签发播放地址 */
  getPlay(id: string, lineId: number): Promise<PlayResult>;
}

export interface ShareServiceDeps {
  shares: SharesRepo;
  lines: LinesRepo;
  play: PlayService;
  /** 站点外部地址，用来拼分享链接（PUBLIC_BASE_URL） */
  publicBaseUrl: string;
  /** 注入 ID 生成器，测试里才能稳定地构造“冲突”场景 */
  genId?: () => string;
}

/** 去重并保留首次出现的位置：分享页的顺序要和用户勾选顺序一致 */
function dedupe(ids: number[]): number[] {
  return [...new Set(ids)];
}

/** 留言按“字符”计长度（与关键词一致），emoji 不会被算成两个 */
function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? '').trim();
  if (trimmed === '') return null;
  if (Array.from(trimmed).length > SHARE_NOTE_MAX) {
    throw badRequest(`note 最长 ${SHARE_NOTE_MAX} 个字符`);
  }
  return trimmed;
}

export function createShareService(deps: ShareServiceDeps): ShareService {
  const { shares, lines, play } = deps;
  const genId = deps.genId ?? shortId;
  const base = deps.publicBaseUrl.replace(/\/+$/, '');

  async function requireShare(id: string) {
    const share = await shares.findById(id);
    if (!share) throw notFound('分享不存在或已失效');
    return share;
  }

  return {
    async create(input) {
      const lineIds = dedupe(input.lineIds);
      if (lineIds.length < 1 || lineIds.length > SHARE_MAX_LINES) {
        throw badRequest(`lineIds 需要 1～${SHARE_MAX_LINES} 条`);
      }
      const note = normalizeNote(input.note);

      // 整体拒绝而不是悄悄丢掉不存在的 id：否则用户以为分享了 5 条，实际只有 4 条
      const found = await lines.findByIds(lineIds);
      if (found.length !== lineIds.length) throw badRequest('lineIds 中包含不存在的台词');

      for (let i = 0; i < ID_RETRY; i++) {
        const id = genId();
        if (await shares.insert({ id, lineIds, note })) {
          return { id, url: `${base}/s/${id}` };
        }
      }
      throw new Error('生成分享 ID 连续冲突，请检查 ID 生成器');
    },

    async get(id) {
      const share = await requireShare(id);
      const found = await lines.findByIds(share.lineIds);
      const byId = new Map(found.map((l) => [l.id, l]));
      // 按存储的顺序还原；语料重灌后已不存在的台词直接略过
      const items = share.lineIds.flatMap((lid) => {
        const hit = byId.get(lid);
        return hit ? [hit] : [];
      });
      if (items.length === 0) throw notFound('分享不存在或已失效');

      // 读取成功才计数；失败的请求不应该抬高浏览量
      await shares.incrementView(id);
      return { id: share.id, note: share.note, createdAt: share.createdAt.toISOString(), items };
    },

    async getPlay(id, lineId) {
      const share = await requireShare(id);
      // 分享链接免口令，所以只能签发“所选台词”的播放地址，不能借它去播别的台词
      if (!share.lineIds.includes(lineId)) throw notFound('该台词不在此分享中');
      return play.getPlay(lineId);
    },
  };
}
