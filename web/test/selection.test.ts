import { describe, expect, it } from 'vitest';
import type { SearchItem } from '../src/api/types';
import { createSelectionStore, MAX_SELECTION, parseStoredSelection } from '../src/store/selection';

// 自编样例，不使用真实台词
const item = (id: number): SearchItem => ({
  id,
  episode: { season: 1, episode: 2, titleEn: null, titleZh: '样例集' },
  startMs: id * 1000,
  endMs: id * 1000 + 800,
  en: `sample line ${id}`,
  zh: `样例台词 ${id}`,
  hasVideo: true,
  thumbnailUrl: null,
});

/** 内存版 storage，顺便记录写入，验证“刷新后能恢复” */
function fakeStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('selection', initial);
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('selection store', () => {
  it('勾选 / 取消，保持勾选顺序', () => {
    const store = createSelectionStore(null);
    expect(store.getState().toggle(item(3))).toBe('added');
    expect(store.getState().toggle(item(1))).toBe('added');
    expect(store.getState().toggle(item(2))).toBe('added');
    expect(store.getState().items.map((i) => i.id)).toEqual([3, 1, 2]);
    expect(store.getState().toggle(item(1))).toBe('removed');
    expect(store.getState().items.map((i) => i.id)).toEqual([3, 2]);
  });

  it('第 21 条被拦截，已选保持 20 条；取消一条后又能勾', () => {
    const store = createSelectionStore(null);
    for (let i = 1; i <= MAX_SELECTION; i++) expect(store.getState().toggle(item(i))).toBe('added');
    expect(store.getState().toggle(item(99))).toBe('limit');
    expect(store.getState().items).toHaveLength(MAX_SELECTION);
    expect(store.getState().items.some((i) => i.id === 99)).toBe(false);

    // 满额时取消已选的仍然可以，不能被“上限”误拦
    expect(store.getState().toggle(item(5))).toBe('removed');
    expect(store.getState().toggle(item(99))).toBe('added');
  });

  it('remove / clear', () => {
    const store = createSelectionStore(null);
    store.getState().toggle(item(1));
    store.getState().toggle(item(2));
    store.getState().remove(1);
    expect(store.getState().items.map((i) => i.id)).toEqual([2]);
    store.getState().clear();
    expect(store.getState().items).toEqual([]);
  });

  it('跨“页面刷新”保留：新建 store 能从同一个 storage 恢复，顺序不变', () => {
    const storage = fakeStorage();
    const a = createSelectionStore(storage);
    a.getState().toggle(item(7));
    a.getState().toggle(item(4));

    const b = createSelectionStore(storage);
    expect(b.getState().items.map((i) => i.id)).toEqual([7, 4]);
    expect(b.getState().items[0]).toEqual(item(7));
  });

  it('清空后存储里不再留旧数据', () => {
    const storage = fakeStorage();
    const store = createSelectionStore(storage);
    store.getState().toggle(item(1));
    store.getState().clear();
    expect(storage.map.has('selection')).toBe(false);
    expect(createSelectionStore(storage).getState().items).toEqual([]);
  });

  it('storage 读写抛错时不崩溃，仍能在内存里勾选', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const store = createSelectionStore(broken);
    expect(store.getState().toggle(item(1))).toBe('added');
    expect(store.getState().items).toHaveLength(1);
  });
});

describe('parseStoredSelection', () => {
  it('坏数据一律当作空，不抛错', () => {
    for (const raw of [null, '', '{', 'null', '123', '{"a":1}', '"x"']) {
      expect(parseStoredSelection(raw)).toEqual([]);
    }
  });

  it('丢弃结构不对的条目，保留合法的；按 id 去重；最多 20 条', () => {
    const bad = { ...item(2), hasVideo: 'yes' };
    const badThumb = { ...item(2), thumbnailUrl: 1 };
    const raw = JSON.stringify([item(1), bad, badThumb, item(1), { id: 5 }, null, item(3)]);
    expect(parseStoredSelection(raw).map((i) => i.id)).toEqual([1, 3]);

    const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => item(i + 1)));
    expect(parseStoredSelection(many)).toHaveLength(MAX_SELECTION);
  });

  it('只保留已知字段', () => {
    const raw = JSON.stringify([{ ...item(1), evil: '<script>' }]);
    expect(parseStoredSelection(raw)[0]).toEqual(item(1));
  });
});
