import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PATHS, connectDb, loadEnv, videoKeyFor } from './config.js';
import { ensureFfmpeg, probeDurationMs, transcodeFile } from './ffmpeg.js';
import { buildEpisodeLines } from './ingest.js';
import { loadEpisode } from './loadToDb.js';
import { runQa } from './qa.js';
import { createR2Store, readR2Config } from './r2Store.js';
import { loadOffsets, parseEpisodeFile, scanSubs, scanVideos, episodeId } from './scan.js';
import { uploadAll } from './upload.js';

const USAGE = `用法：npm run pipeline -- <子命令> [选项]

子命令：
  transcode            S1 转码：raw/video → work/mp4（480p H.264，每秒一个关键帧）
      --only S01E01    只处理指定集（可重复）
      --force          覆盖已存在的输出
      --fast           使用 veryfast 预设，快很多但文件更大（默认 slow）
  ingest               S2～S4：解析、对齐、入库（按季集 upsert，可重复运行）
      --clean          清洗：去格式标记、音效、♪、广告，合并断句
      --only S01E01    只处理指定集（可重复）
      --dry-run        只解析并打印汇总，不连数据库
  upload               S5：STORAGE_DRIVER=r2 时把 work/mp4 上传到 R2（已存在且大小一致的跳过，可随时中断重跑）；
                       无论哪种模式，最后都校验 work/mp4 与库里的记录是否对应
      --force          已存在也重新上传
  qa                   S6：生成 work/qa-report.md；有不合格的集时退出码为 1
`;

const ago = (t0: number): string => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

function onlySet(only: string[] | undefined): Set<string> | null {
  if (!only || only.length === 0) return null;
  return new Set(only.map((s) => s.toUpperCase()));
}

async function cmdTranscode(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { only: { type: 'string', multiple: true }, force: { type: 'boolean' }, fast: { type: 'boolean' } },
    strict: true,
  });
  const only = onlySet(values.only);
  const videos = scanVideos(PATHS.rawVideo).filter((v) => !only || only.has(v.id));
  if (videos.length === 0) {
    console.error(`在 ${PATHS.rawVideo} 里没有找到可处理的视频（文件名需含 S01E01 这样的季集标识）。`);
    return 1;
  }
  await ensureFfmpeg();

  for (const v of videos) {
    const out = path.join(PATHS.workMp4, `${v.id}.mp4`);
    if (existsSync(out) && !values.force) {
      console.log(`[transcode] ${v.id} 已存在，跳过（加 --force 重新转码）`);
      continue;
    }
    console.log(`[transcode] ${v.id} 开始：${path.basename(v.path)}`);
    const t0 = Date.now();
    await transcodeFile(v.path, out, { preset: values.fast ? 'veryfast' : 'slow' });
    console.log(`[transcode] ${v.id} 完成，用时 ${ago(t0)}`);
  }
  return 0;
}

async function cmdIngest(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      clean: { type: 'boolean' },
      only: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean' },
    },
    strict: true,
  });
  const only = onlySet(values.only);
  const subs = scanSubs(PATHS.rawSubs).filter((s) => !only || only.has(s.id));
  if (subs.length === 0) {
    console.error(`在 ${PATHS.rawSubs} 里没有找到字幕（.srt，文件名需含 S01E01 这样的季集标识）。`);
    return 1;
  }
  const offsets = loadOffsets(PATHS.offsets);
  const mp4s = new Map(scanVideos(PATHS.workMp4).map((v) => [v.id, v.path]));
  const clean = values.clean === true;
  const dryRun = values['dry-run'] === true;
  if (!clean) console.log('[ingest] 未加 --clean：不做清洗，字幕里的格式标记、音效等会原样入库');

  const client = dryRun ? null : await connectDb();
  try {
    for (const src of subs) {
      const offsetMs = offsets[src.id] ?? 0;
      const { lines, stats, notes } = buildEpisodeLines(src, { clean, offsetMs });
      for (const n of notes) console.log(`[ingest] ${src.id} 提示：${n}`);
      const pct = stats.lineCount === 0 ? 0 : (stats.bothCount / stats.lineCount) * 100;
      const summary = `${stats.lineCount} 条台词，中英都有 ${pct.toFixed(1)}%，偏移 ${offsetMs}ms，跳过坏块 ${stats.skippedBlocks}`;

      if (!client) {
        console.log(`[ingest] ${src.id} (dry-run) ${summary}`);
        continue;
      }
      // 有转码后的 mp4 才登记视频；时长用 ffprobe 取，取不到不影响入库
      const mp4 = mp4s.get(src.id);
      let durationMs: number | null = null;
      if (mp4) {
        try {
          durationMs = await probeDurationMs(mp4);
        } catch {
          console.warn(`[ingest] ${src.id} 未能读取视频时长（ffprobe 不可用？），QA 将跳过时长校验`);
        }
      }
      const res = await loadEpisode(client, {
        season: src.season,
        episode: src.episode,
        videoKey: mp4 ? videoKeyFor(src.id) : null,
        durationMs,
        offsetMs,
        lines,
      });
      console.log(`[ingest] ${src.id} 已入库：${summary}；变更 ${res.changed} 行，删除 ${res.deleted} 行`);
    }
  } finally {
    await client?.end();
  }
  return 0;
}

/**
 * S5：STORAGE_DRIVER=r2 时上传到 R2；local 模式 work/mp4 本身就是存储，没有东西需要上传。
 * pipeline 不能引用 server 的代码（手册 §3.2），所以上传逻辑在 upload.ts / r2Store.ts 里单独实现。
 * 上传之后（或 local 模式下）都做一件事：检查本地视频和库里的记录是否一一对应。
 */
async function cmdUpload(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { force: { type: 'boolean' } }, strict: true });
  // 先读 .env，才能拿到 STORAGE_DRIVER 与 R2_*
  loadEnv();
  const files = existsSync(PATHS.workMp4) ? readdirSync(PATHS.workMp4).filter((f) => f.endsWith('.mp4') && !f.includes('.tmp.')) : [];

  const driver = process.env.STORAGE_DRIVER?.trim() || 'local';
  if (driver !== 'local' && driver !== 'r2') {
    console.error(`[upload] STORAGE_DRIVER 取值无效：${driver}（可选 local / r2）`);
    return 1;
  }

  if (driver === 'r2') {
    if (files.length === 0) {
      console.error(`[upload] ${PATHS.workMp4} 里没有可上传的 mp4，先运行 transcode`);
      return 1;
    }
    const store = createR2Store(readR2Config(process.env));
    const items = files.sort().map((f) => {
      const localPath = path.join(PATHS.workMp4, f);
      return { key: videoKeyFor(f.replace(/\.mp4$/, '')), localPath, size: statSync(localPath).size };
    });
    console.log(`[upload] 上传到 R2：共 ${items.length} 个文件`);
    const t0 = Date.now();
    const results = await uploadAll(store, items, {
      force: values.force === true,
      onProgress: (r, i, n) => console.log(`[upload] (${i + 1}/${n}) ${r.key} ${{ uploaded: '已上传', skipped: '已存在，跳过', failed: `失败：${r.error}` }[r.status]}`),
    });
    const count = (s: string) => results.filter((r) => r.status === s).length;
    console.log(`[upload] 完成，用时 ${ago(t0)}：上传 ${count('uploaded')}，跳过 ${count('skipped')}，失败 ${count('failed')}`);
    if (count('failed') > 0) {
      console.error('[upload] 有文件失败：直接重新运行同一条命令，已完成的会被跳过');
      return 1;
    }
  } else {
    console.log('[upload] 当前为 local 存储模式，无需上传（要传到 R2 请设置 STORAGE_DRIVER=r2）。');
  }

  const client = await connectDb();
  try {
    const res = await client.query<{ season: number; episode: number; video_key: string | null }>(
      'SELECT season, episode, video_key FROM episodes ORDER BY season, episode',
    );
    const inDb = new Map(res.rows.map((r) => [episodeId(r), r.video_key]));
    let problems = 0;
    for (const f of files) {
      const info = parseEpisodeFile(f.replace(/\.mp4$/, '.srt'));
      const id = info ? episodeId(info) : null;
      if (!id || !inDb.has(id)) {
        console.log(`[upload] ${f}：库里没有对应的集，先运行 ingest`);
        problems++;
      } else if (inDb.get(id) !== videoKeyFor(id)) {
        console.log(`[upload] ${f}：库里没有登记视频，请重新运行 ingest`);
        problems++;
      }
    }
    for (const [id, key] of inDb) {
      if (key && !files.includes(`${id}.mp4`)) {
        console.log(`[upload] ${id}：库里登记了视频，但 work/mp4 里没有文件`);
        problems++;
      }
    }
    console.log(problems === 0 ? `[upload] 校验通过：${files.length} 个视频与库中记录一致` : `[upload] 发现 ${problems} 个问题`);
    return problems === 0 ? 0 : 1;
  } finally {
    await client.end();
  }
}

async function cmdQa(): Promise<number> {
  const client = await connectDb();
  try {
    const list = await runQa(client, PATHS.qaReport);
    const bad = list.filter((e) => e.problems.length > 0);
    console.log(`[qa] 报告已生成：${PATHS.qaReport}`);
    console.log(`[qa] 合格 ${list.length - bad.length} / ${list.length} 集`);
    for (const e of bad) console.log(`[qa] 不合格 ${e.id}：${e.problems.join('；')}`);
    return bad.length === 0 ? 0 : 1;
  } finally {
    await client.end();
  }
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'transcode':
      return cmdTranscode(rest);
    case 'ingest':
      return cmdIngest(rest);
    case 'upload':
      return cmdUpload(rest);
    case 'qa':
      return cmdQa();
    default:
      console.log(USAGE);
      return cmd ? 1 : 0;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`[pipeline] 失败：${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
