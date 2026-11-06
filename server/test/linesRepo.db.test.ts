// SQL 级测试：连真实 Postgres，在一个临时 schema 里建表，测完整个删除，不碰已有数据。
// 没有数据库连接串时整组跳过，避免无库环境下测试失败。
// 台词全部是自编的虚构句子，不使用真实剧本内容。
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import type { Db } from '../src/db/client.js';
import { createEpisodesRepo } from '../src/repos/episodesRepo.js';
import { createLinesRepo, type SearchHit } from '../src/repos/linesRepo.js';
import { createSharesRepo } from '../src/repos/sharesRepo.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
for (const name of ['.env', '.env.local']) {
  const file = path.join(REPO_ROOT, name);
  if (existsSync(file)) process.loadEnvFile(file);
}
// 临时 schema 需要在同一连接上 SET search_path，所以用直连地址 + 单连接，
// 不用池化地址（Neon 的 pgbouncer 事务模式不保证 SET 生效）
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

describe('linesRepo / episodesRepo（真实数据库）', { skip: url ? false : '未设置 DATABASE_URL，跳过' }, () => {
  const schema = `test_m2_${process.pid}_${Date.now()}`;
  let client: pg.Client;
  let db: Db;
  const ids: Record<string, number> = {}; // 记下几条关键台词的 id，供上下文测试使用

  before(async () => {
    client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
    await client.connect();
    db = { query: (text, params) => client.query(text, params) };

    await client.query(`CREATE SCHEMA ${schema}`);
    // public 放第二位：pg_trgm 的操作符类装在 public 里，表则建在临时 schema
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(readFileSync(path.join(import.meta.dirname, '../src/db/migrations/001_init.sql'), 'utf8'));

    const addEpisode = async (season: number, episode: number, titleEn: string | null, videoKey: string | null) =>
      (
        await client.query<{ id: number }>(
          'INSERT INTO episodes (season, episode, title_en, title_zh, video_key) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [season, episode, titleEn, titleEn ? `${titleEn}（中）` : null, videoKey],
        )
      ).rows[0]!.id;
    const addLine = async (episodeId: number, idx: number, en: string, zh: string) =>
      Number(
        (
          await client.query<{ id: string }>(
            'INSERT INTO lines (episode_id, idx, start_ms, end_ms, en, zh) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [episodeId, idx, idx * 1000, idx * 1000 + 800, en, zh],
          )
        ).rows[0]!.id,
      );

    const e11 = await addEpisode(1, 1, 'Pilot Sample', 'x/S01E01.mp4');
    const e12 = await addEpisode(1, 2, 'Second Sample', null); // 只有文字
    const e21 = await addEpisode(2, 1, null, 'x/S02E01.mp4');

    // S01E01：5 句，用于通配符 / AND / 上下文
    ids.e11_0 = await addLine(e11, 0, 'Hello Zorblax, welcome aboard.', '你好，佐布拉克斯，欢迎登船。');
    ids.e11_1 = await addLine(e11, 1, 'The battery is at 100% now.', '电池现在是百分之百。');
    ids.e11_2 = await addLine(e11, 2, 'Rename it to snake_case please.', '请改成蛇形命名。');
    ids.e11_3 = await addLine(e11, 3, 'Path is C:\\temp\\file.', '路径是临时目录。');
    ids.e11_4 = await addLine(e11, 4, 'Wibbled water is not allowed.', '不许喝变形水。'); // 只含子串 wibble
    // S01E02：2 句，没有视频
    ids.e12_0 = await addLine(e12, 0, 'Zorblax says goodbye.', '佐布拉克斯说再见。');
    ids.e12_1 = await addLine(e12, 1, 'Plain filler sentence.', '普通的填充句。');
    // S02E01：12 句，每 3 句有 1 句含整词 wibble，其余只含子串 wibbles
    for (let i = 0; i < 12; i++) {
      const en = i % 3 === 0 ? `Wibble number ${i}.` : `Wibbles number ${i}.`;
      const last = await addLine(e21, i, en, `第${i}句`);
      ids[`e21_${i}`] = last;
    }
  });

  after(async () => {
    if (!client) return;
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end().catch(() => {});
  });

  const lines = () => createLinesRepo(db);
  const search = (terms: string[], extra: { season?: number; limit?: number; offset?: number } = {}) =>
    lines().search({ terms, limit: 50, offset: 0, ...extra });

  test('英文：大小写不敏感的子串命中', async () => {
    const r = await search(['zorblax']);
    assert.equal(r.total, 2);
    assert.deepEqual(r.items.map((i) => i.id), [ids.e11_0, ids.e12_0]);
  });

  test('中文：子串命中，无需分词', async () => {
    const r = await search(['佐布拉克斯']);
    assert.equal(r.total, 2);
    const r2 = await search(['拉克']);
    assert.equal(r2.total, 2);
  });

  test('返回结构：episode 信息与 hasVideo', async () => {
    const r = await search(['zorblax']);
    const [first, second] = r.items as [SearchHit, SearchHit];
    assert.deepEqual(first.episode, { season: 1, episode: 1, titleEn: 'Pilot Sample', titleZh: 'Pilot Sample（中）' });
    assert.equal(first.hasVideo, true);
    assert.equal(second.hasVideo, false);
    assert.equal(typeof first.id, 'number');
    assert.equal(first.startMs, 0);
    assert.equal(first.endMs, 800);
  });

  test('通配符：% 只匹配字面百分号，不会匹配所有行', async () => {
    const r = await search(['%']);
    assert.equal(r.total, 1);
    assert.equal(r.items[0]?.id, ids.e11_1);
  });

  test('通配符：_ 只匹配字面下划线', async () => {
    const r = await search(['_']);
    assert.equal(r.total, 1);
    assert.equal(r.items[0]?.id, ids.e11_2);
    // snake_case 里的 _ 不能被当成“任意一个字符”去匹配 snakeXcase
    assert.equal((await search(['snake_case'])).total, 1);
    assert.equal((await search(['snak_case'])).total, 0);
  });

  test('通配符：反斜杠按字面匹配', async () => {
    const r = await search(['\\']);
    assert.equal(r.total, 1);
    assert.equal(r.items[0]?.id, ids.e11_3);
  });

  test('含 SQL 元字符的输入不会报错或注入', async () => {
    for (const t of ["'; DROP TABLE lines; --", '"', '(', '[', '.*', '\\m']) {
      await assert.doesNotReject(() => search([t]), `term=${t}`);
    }
    assert.equal((await search(['.*'])).total, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM lines')).rows[0]?.['n'], 19);
  });

  test('多个词 AND：每个词都要在英文或中文里出现，可跨语言', async () => {
    assert.equal((await search(['zorblax', 'welcome'])).total, 1);
    assert.equal((await search(['zorblax', '欢迎'])).total, 1); // 一个词在英文、一个在中文
    assert.equal((await search(['zorblax', 'wibble'])).total, 0);
  });

  test('exact=1：连续子串命中；返回行是默认分词 AND 结果的子集（手册 M2 验收）', async () => {
    const repo = lines();
    // e11_1 英文含 “battery” 与 “is”，且含连续子串 “battery is”
    const loose = await repo.search({
      terms: ['battery', 'is'],
      mode: 'and',
      limit: 100,
      offset: 0,
      exact: false,
    });
    const strict = await repo.search({
      terms: ['battery is'],
      mode: 'and',
      limit: 100,
      offset: 0,
      exact: true,
    });
    assert.ok(loose.total >= 1);
    assert.ok(strict.total >= 1);
    const allowed = new Set(loose.items.map((r) => r.id));
    for (const row of strict.items) {
      assert.ok(allowed.has(row.id), `exact 命中的 id=${row.id} 应同时被分词 AND 命中`);
    }
  });

  test('season 筛选', async () => {
    assert.equal((await search(['zorblax'], { season: 1 })).total, 2);
    assert.equal((await search(['zorblax'], { season: 2 })).total, 0);
    assert.equal((await search(['wibble'], { season: 2 })).total, 12);
  });

  test('排序：整词命中优先，其后按季 / 集 / 序号', async () => {
    const r = await search(['wibble']);
    // S01E01 里的 “Wibbled” 只是子串，应排在所有整词 “Wibble” 之后，尽管它的季集更靠前
    assert.equal(r.total, 13);
    const wholeWord = r.items.slice(0, 4).map((i) => i.id);
    assert.deepEqual(wholeWord, [ids.e21_0, ids.e21_3, ids.e21_6, ids.e21_9]);
    assert.equal(r.items[4]?.id, ids.e11_4); // 子串命中的第一条
  });

  test('翻页稳定：逐页翻完与一次取完顺序一致，无重复无遗漏', async () => {
    const all = (await search(['wibble'])).items.map((i) => i.id);
    const paged: number[] = [];
    let total = 0;
    for (let page = 1; page <= 10; page++) {
      const r = await search(['wibble'], { limit: 4, offset: (page - 1) * 4 });
      total = r.total;
      paged.push(...r.items.map((i) => i.id));
      if (r.items.length < 4) break;
    }
    assert.equal(total, all.length);
    assert.equal(new Set(paged).size, paged.length, '分页结果有重复');
    assert.deepEqual(paged, all);
  });

  test('超出最后一页：items 为空，total 仍然正确', async () => {
    const r = await search(['wibble'], { limit: 20, offset: 1000 });
    assert.equal(r.items.length, 0);
    assert.equal(r.total, 13);
  });

  test('context：取中间一句，前后各 2 句，按序号升序', async () => {
    const ctx = await lines().findContext(ids.e21_5!, 2, 2);
    assert.ok(ctx);
    assert.deepEqual(ctx.lines.map((l) => l.idx), [3, 4, 5, 6, 7]);
    assert.ok(ctx.lines.some((l) => l.id === ids.e21_5));
    assert.deepEqual(ctx.episode, { season: 2, episode: 1, titleEn: null, titleZh: null });
  });

  test('context：集首与集尾不越集', async () => {
    const head = await lines().findContext(ids.e11_0!, 5, 2);
    assert.deepEqual(head?.lines.map((l) => l.idx), [0, 1, 2]);
    const tail = await lines().findContext(ids.e11_4!, 2, 5);
    assert.deepEqual(tail?.lines.map((l) => l.idx), [2, 3, 4]);
    // 上一集的最后一句不会出现在下一集的上下文里
    const e12 = await lines().findContext(ids.e12_0!, 5, 5);
    assert.deepEqual(e12?.lines.map((l) => l.id), [ids.e12_0, ids.e12_1]);
  });

  test('context：before / after 为 0 只返回本条；不存在的 id 返回 null', async () => {
    const only = await lines().findContext(ids.e21_5!, 0, 0);
    assert.deepEqual(only?.lines.map((l) => l.id), [ids.e21_5]);
    assert.equal(await lines().findContext(999_999_999, 2, 2), null);
  });

  test('findPlayInfo：返回起止与 videoKey；无视频为 null；不存在返回 null', async () => {
    assert.deepEqual(await lines().findPlayInfo(ids.e11_1!), { startMs: 1000, endMs: 1800, videoKey: 'x/S01E01.mp4' });
    assert.deepEqual(await lines().findPlayInfo(ids.e12_0!), { startMs: 0, endMs: 800, videoKey: null });
    assert.equal(await lines().findPlayInfo(999_999_999), null);
  });

  test('findByIds：按 id 批量取，缺失的不报错，空数组返回空', async () => {
    const got = await lines().findByIds([ids.e12_0!, 999_999_999, ids.e11_0!]);
    assert.deepEqual(got.map((h) => h.id).sort((a, b) => a - b), [ids.e11_0!, ids.e12_0!].sort((a, b) => a - b));
    const byId = new Map(got.map((h) => [h.id, h]));
    assert.equal(byId.get(ids.e11_0!)?.hasVideo, true);
    assert.equal(byId.get(ids.e12_0!)?.hasVideo, false);
    assert.equal(byId.get(ids.e11_0!)?.episode.season, 1);
    assert.deepEqual(await lines().findByIds([]), []);
  });

  test('sharesRepo：写入保序、ID 冲突返回 false、浏览量原子自增', async () => {
    const repo = createSharesRepo(db);
    const order = [ids.e21_3!, ids.e11_0!, ids.e12_1!];
    assert.equal(await repo.insert({ id: 'Tst00001', lineIds: order, note: '备注' }), true);
    assert.equal(await repo.insert({ id: 'Tst00001', lineIds: [ids.e11_0!], note: null }), false);

    const found = await repo.findById('Tst00001');
    assert.deepEqual(found?.lineIds, order, '必须保持写入顺序');
    assert.equal(found?.note, '备注');
    assert.ok(found?.createdAt instanceof Date);
    assert.equal(await repo.findById('Nope0000'), null);

    await Promise.all([repo.incrementView('Tst00001'), repo.incrementView('Tst00001')]);
    const row = await db.query<{ view_count: number }>('SELECT view_count FROM shares WHERE id = $1', ['Tst00001']);
    assert.equal(row.rows[0]?.view_count, 2);
  });

  test('episodes.listAll：按季集排序并带 hasVideo', async () => {
    const list = await createEpisodesRepo(db).listAll();
    assert.deepEqual(
      list.map((e) => [e.season, e.episode, e.hasVideo]),
      [
        [1, 1, true],
        [1, 2, false],
        [2, 1, true],
      ],
    );
  });
});
