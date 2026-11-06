// 已勾选的台词（手册 §7.5）：Zustand + sessionStorage。
// 存完整台词对象而不是 ID：分享对话框无需再请求，而且换关键词、翻页后卡片已不在屏幕上，也能展示。
import { create } from 'zustand';
import type { SearchItem } from '../api/types';

/** 手册 §1：一次最多勾选 20 条 */
export const MAX_SELECTION = 20;
const STORAGE_KEY = 'selection';

export type ToggleResult = 'added' | 'removed' | 'limit';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** 只取已知字段：sessionStorage 里的内容可能被手动改过或来自旧版本，不能原样信任 */
function toItem(v: unknown): SearchItem | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const ep = o.episode as Record<string, unknown> | null | undefined;
  if (
    !isNum(o.id) ||
    !Number.isInteger(o.id) ||
    o.id < 1 ||
    typeof ep !== 'object' ||
    ep === null ||
    !isNum(ep.season) ||
    !isNum(ep.episode) ||
    !isStrOrNull(ep.titleEn) ||
    !isStrOrNull(ep.titleZh) ||
    !isNum(o.startMs) ||
    !isNum(o.endMs) ||
    typeof o.en !== 'string' ||
    typeof o.zh !== 'string' ||
    typeof o.hasVideo !== 'boolean'
  ) {
    return null;
  }
  return {
    id: o.id,
    episode: { season: ep.season, episode: ep.episode, titleEn: ep.titleEn, titleZh: ep.titleZh },
    startMs: o.startMs,
    endMs: o.endMs,
    en: o.en,
    zh: o.zh,
    hasVideo: o.hasVideo,
  };
}

/** 解析存储内容：任何不合法的东西都当作“没有勾选”，绝不抛错（否则页面会白屏） */
export function parseStoredSelection(raw: string | null): SearchItem[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<number>();
  const items: SearchItem[] = [];
  for (const v of data) {
    const item = toItem(v);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length === MAX_SELECTION) break;
  }
  return items;
}

interface SelectionState {
  /** 按勾选顺序排列，分享时也按这个顺序 */
  items: SearchItem[];
  /** 已选则取消；未选则加入，满 20 条时拒绝并返回 'limit' */
  toggle: (item: SearchItem) => ToggleResult;
  remove: (id: number) => void;
  clear: () => void;
}

/** 隐私模式下访问 sessionStorage 可能直接抛错，取不到就退化为“只在内存里”，功能照常 */
function getSessionStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

// 工厂函数：测试里可以传入假 storage，不依赖浏览器环境
export function createSelectionStore(storage: StorageLike | null) {
  const save = (items: SearchItem[]) => {
    try {
      if (items.length === 0) storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // 配额或隐私模式写入失败只影响“刷新后是否保留”，本次勾选照常生效
    }
  };

  let initial: SearchItem[] = [];
  try {
    initial = parseStoredSelection(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    initial = [];
  }

  return create<SelectionState>((set, get) => ({
    items: initial,
    toggle: (item) => {
      const { items } = get();
      if (items.some((i) => i.id === item.id)) {
        const next = items.filter((i) => i.id !== item.id);
        save(next);
        set({ items: next });
        return 'removed';
      }
      if (items.length >= MAX_SELECTION) return 'limit';
      const next = [...items, item];
      save(next);
      set({ items: next });
      return 'added';
    },
    remove: (id) => {
      const next = get().items.filter((i) => i.id !== id);
      save(next);
      set({ items: next });
    },
    clear: () => {
      save([]);
      set({ items: [] });
    },
  }));
}

export const useSelectionStore = createSelectionStore(getSessionStorage());
