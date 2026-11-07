// 管线：从转码后的 mp4 在台词中点截一帧，上传 JPEG 到 R2（或复制到 work/mp4），并写回 lines.frame_key。
// pipeline 不能引用 server（手册 §3.2）。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from 'pg';
import { PATHS, connectDb, frameKeyForLineId, loadEnv, REPO_ROOT } from './config.js';
import { ensureFfmpeg } from './ffmpeg.js';
import { createR2Store, readR2Config } from './r2Store.js';
import { episodeId } from './scan.js';
import { uploadAll, type ObjectStore } from './upload.js';

function buildFrameExtractArgs(videoPath: string, tSec: number, outJpg: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(tSec), '-i', videoPath, '-frames:v', '1', '-q:v', '3', outJpg];
}

async function extractFrame(videoPath: string, tSec: number, outJpg: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', buildFrameExtractArgs(videoPath, tSec, outJpg), { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 截帧退出码 ${code ?? '?'}`))));
  });
}

interface LineRow {
  id: string;
  start_ms: number;
  end_ms: number;
}

async function loadLinesForEpisode(client: Client, season: number, episode: number): Promise<LineRow[]> {
  const res = await client.query<LineRow>(
    `SELECT l.id, l.start_ms, l.end_ms
     FROM lines l
     JOIN episodes e ON e.id = l.episode_id
     WHERE e.season = $1 AND e.episode = $2
     ORDER BY l.idx`,
    [season, episode],
  );
  return res.rows;
}

export interface ThumbnailsOptions {
  only?: Set<string> | null;
  force?: boolean;
  onEpisode?: (id: string, lineCount: number) => void;
  onLine?: (lineId: number, status: 'uploaded' | 'skipped' | 'failed', detail?: string) => void;
}

/**
 * 对有视频的每一集：截帧 → 上传 → UPDATE lines.frame_key。
 * 临时文件在 work/frames/.tmp/，用完删除。
 */
export async function runThumbnails(opts: ThumbnailsOptions = {}): Promise<{ episodes: number; linesOk: number; failed: number }> {
  loadEnv();
  await ensureFfmpeg();

  const driver = process.env.STORAGE_DRIVER?.trim() || 'local';
  if (driver !== 'local' && driver !== 'r2') {
    throw new Error(`STORAGE_DRIVER 取值无效：${driver}（可选 local / r2）`);
  }

  const store: ObjectStore | null = driver === 'r2' ? createR2Store(readR2Config(process.env)) : null;

  const tmpDir = path.join(REPO_ROOT, 'work', 'frames', '.tmp');
  mkdirSync(tmpDir, { recursive: true });

  const client = await connectDb();
  let episodesTouched = 0;
  let linesOk = 0;
  let failed = 0;

  try {
    const epRes = await client.query<{ season: number; episode: number }>(
      'SELECT season, episode FROM episodes WHERE video_key IS NOT NULL ORDER BY season, episode',
    );

    for (const ep of epRes.rows) {
      const sid = episodeId(ep);
      if (opts.only && !opts.only.has(sid)) continue;

      const mp4 = path.join(PATHS.workMp4, `${sid}.mp4`);
      if (!existsSync(mp4)) {
        console.warn(`[thumbnails] ${sid}：work/mp4 里没有 ${sid}.mp4，跳过（先 transcode）`);
        continue;
      }

      const rows = await loadLinesForEpisode(client, ep.season, ep.episode);
      opts.onEpisode?.(sid, rows.length);
      episodesTouched++;

      for (const row of rows) {
        const lineId = Number(row.id);
        const key = frameKeyForLineId(lineId);
        const tSec = (row.start_ms + row.end_ms) / 2000;
        const tmpJpg = path.join(tmpDir, `${lineId}.jpg`);

        try {
          if (!opts.force) {
            const cur = await client.query<{ frame_key: string | null }>('SELECT frame_key FROM lines WHERE id = $1', [lineId]);
            if (cur.rows[0]?.frame_key) {
              opts.onLine?.(lineId, 'skipped');
              continue;
            }
          }

          if (driver === 'r2' && store) {
            const remote = opts.force ? null : await store.head(key);
            if (remote && !opts.force) {
              await client.query('UPDATE lines SET frame_key = $1 WHERE id = $2', [key, lineId]);
              linesOk++;
              opts.onLine?.(lineId, 'skipped');
              continue;
            }
          } else {
            const dest = path.join(PATHS.workMp4, path.posix.basename(key));
            if (existsSync(dest) && !opts.force) {
              await client.query('UPDATE lines SET frame_key = $1 WHERE id = $2', [key, lineId]);
              linesOk++;
              opts.onLine?.(lineId, 'skipped');
              continue;
            }
          }

          await extractFrame(mp4, tSec, tmpJpg);
          const st = await stat(tmpJpg);

          if (driver === 'r2' && store) {
            const results = await uploadAll(
              store,
              [{ key, localPath: tmpJpg, size: st.size, contentType: 'image/jpeg' }],
              { force: opts.force },
            );
            const r = results[0]!;
            if (r.status === 'failed') {
              failed++;
              opts.onLine?.(lineId, 'failed', r.error);
              continue;
            }
          } else {
            await mkdir(PATHS.workMp4, { recursive: true });
            await copyFile(tmpJpg, path.join(PATHS.workMp4, path.posix.basename(key)));
          }

          await client.query('UPDATE lines SET frame_key = $1 WHERE id = $2', [key, lineId]);
          linesOk++;
          opts.onLine?.(lineId, 'uploaded');
        } catch (e) {
          failed++;
          opts.onLine?.(lineId, 'failed', e instanceof Error ? e.message : String(e));
        } finally {
          try {
            unlinkSync(tmpJpg);
          } catch {
            /* 可能未生成 */
          }
        }
      }
    }

    return { episodes: episodesTouched, linesOk, failed };
  } finally {
    await client.end();
  }
}
