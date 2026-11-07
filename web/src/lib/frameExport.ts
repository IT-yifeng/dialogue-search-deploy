// 从 <video> 当前帧导出 JPG（M8）：画面内底部中英字幕，不含出处条。

import type { EpisodeBrief } from '../api/types';
import { SERIES_TITLE } from './copyText';
import { formatEpisodeCode } from './formatTime';
import { type AspectPreset, computeCropRect } from './frameCrop';

export type FrameExportErrorCode = 'NOT_READY' | 'TAINTED' | 'EMPTY';

export class FrameExportError extends Error {
  readonly code: FrameExportErrorCode;

  constructor(code: FrameExportErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const JPEG_QUALITY = 0.92;
const FONT_STACK = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

export interface ExportSubtitles {
  en: string;
  zh: string;
}

interface ExportOptions {
  video: HTMLVideoElement;
  subtitles: ExportSubtitles;
  preset: AspectPreset;
  panX: number;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= 1) {
    if (ctx.measureText(text).width <= maxWidth) return [text];
    // 中文等无空格：按字符折行
    const chars = [...text];
    const lines: string[] = [];
    let cur = '';
    for (const ch of chars) {
      const next = cur + ch;
      if (ctx.measureText(next).width > maxWidth && cur) {
        lines.push(cur);
        cur = ch;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines.slice(0, 2) : [text.slice(0, 48)];
  }
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
    if (lines.length >= 2) break;
  }
  if (lines.length < 2 && cur) lines.push(cur);
  return lines.slice(0, 2);
}

/** 在画面底部居中绘制双语字幕（对齐蒙版 VideoSubtitleOverlay 语义） */
function drawSubtitles(ctx: CanvasRenderingContext2D, w: number, h: number, sub: ExportSubtitles): void {
  const en = sub.en.trim();
  const zh = sub.zh.trim();
  if (!en && !zh) return;

  const barH = Math.max(h * 0.24, 72);
  const grad = ctx.createLinearGradient(0, h - barH, 0, h);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - barH, w, barH);

  const fontSize = Math.max(13, Math.min(26, Math.round(w * 0.034)));
  const lineHeight = fontSize * 1.38;
  const maxTextW = w * 0.88;
  const padBottom = Math.max(16, h * 0.06);

  const rows: { text: string; bold: boolean }[] = [];
  if (en) {
    ctx.font = `600 ${fontSize}px ${FONT_STACK}`;
    for (const line of wrapText(ctx, en, maxTextW)) rows.push({ text: line, bold: true });
  }
  if (zh) {
    ctx.font = `400 ${fontSize}px ${FONT_STACK}`;
    for (const line of wrapText(ctx, zh, maxTextW)) rows.push({ text: line, bold: false });
  }
  const visible = rows.slice(0, 4);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  let y = h - padBottom;
  for (let i = visible.length - 1; i >= 0; i--) {
    const row = visible[i]!;
    ctx.font = `${row.bold ? '600' : '400'} ${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = row.bold ? '#ffffff' : 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillText(row.text, w / 2, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    y -= lineHeight;
  }
}

/** 裁切后的画布：视频帧 + 叠在画面内的双语字幕 */
export function renderFrameCanvas(options: ExportOptions): HTMLCanvasElement {
  const { video, subtitles, preset, panX } = options;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) {
    throw new FrameExportError('NOT_READY', '视频画面尚未就绪，请稍后再试');
  }

  const crop = computeCropRect(vw, vh, preset, panX);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new FrameExportError('NOT_READY', '无法创建画布');
  }

  const snap = document.createElement('canvas');
  snap.width = vw;
  snap.height = vh;
  const snapCtx = snap.getContext('2d');
  if (!snapCtx) {
    throw new FrameExportError('NOT_READY', '无法创建画布');
  }

  try {
    snapCtx.drawImage(video, 0, 0, vw, vh);
    snapCtx.getImageData(0, 0, 1, 1);
  } catch {
    throw new FrameExportError(
      'TAINTED',
      '无法读取视频画面。若使用 R2，请为桶配置 CORS 并允许本站域名 GET（见 docs/DEPLOY.md）。',
    );
  }

  ctx.drawImage(snap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  drawSubtitles(ctx, crop.width, crop.height, subtitles);

  return canvas;
}

export function exportFilename(
  episode: Pick<EpisodeBrief, 'season' | 'episode'>,
  timeMs: number,
  preset: AspectPreset,
): string {
  const code = formatEpisodeCode(episode.season, episode.episode);
  const sec = Math.max(0, Math.floor(timeMs / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const t = `${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
  const aspect = preset === 'original' ? 'original' : preset.replace(':', 'x');
  return `${SERIES_TITLE}_${code}_${t}_${aspect}.jpg`;
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          reject(new FrameExportError('EMPTY', '导出失败：画布无法编码为 JPEG（可能是跨域限制）'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export function downloadJpeg(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
