// M8：截取当前播放画面，裁切预设 + 水平拖动，导出带出处条的 JPG。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchItem } from '../api/types';
import { disposeExportVideo, loadExportVideoFrame, type ExportVideoHandle } from '../lib/corsExportVideo';
import type { AspectPreset } from '../lib/frameCrop';
import { maxHorizontalPan } from '../lib/frameCrop';
import {
  canvasToJpegBlob,
  downloadJpeg,
  exportFilename,
  FrameExportError,
  renderFrameCanvas,
  type ExportSubtitles,
} from '../lib/frameExport';
import { CloseIcon } from './icons';

const PRESETS: { id: AspectPreset; label: string }[] = [
  { id: 'original', label: '原画幅' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
];

interface Props {
  open: boolean;
  /** 与主播放器相同的预签名 / 同源地址 */
  playUrl: string | null;
  /** 同源时可复用主播放器，避免二次加载 */
  sourceVideo?: HTMLVideoElement | null;
  line: Pick<SearchItem, 'episode'>;
  subtitles: ExportSubtitles;
  timeMs: number;
  onClose: () => void;
}

export function FrameExportDialog({ open, playUrl, sourceVideo, line, subtitles, timeMs, onClose }: Props) {
  const [preset, setPreset] = useState<AspectPreset>('original');
  const [panX, setPanX] = useState(0.5);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [exportVideo, setExportVideo] = useState<HTMLVideoElement | null>(null);
  const exportHandleRef = useRef<ExportVideoHandle | null>(null);

  const vw = exportVideo?.videoWidth ?? 0;
  const vh = exportVideo?.videoHeight ?? 0;
  const canPan = preset !== 'original' && vw > 0 && maxHorizontalPan(vw, preset, vh) > 1;

  useEffect(() => {
    if (!open) {
      setPreset('original');
      setPanX(0.5);
      setError(null);
      setPreviewUrl(null);
      disposeExportVideo(exportHandleRef.current);
      exportHandleRef.current = null;
      setExportVideo(null);
      setPreparing(false);
      return;
    }
    if (!playUrl) {
      setError('没有可用的播放地址');
      return;
    }

    const ac = new AbortController();
    setPreparing(true);
    setError(null);
    setPreviewUrl(null);
    disposeExportVideo(exportHandleRef.current);
    exportHandleRef.current = null;
    setExportVideo(null);

    void loadExportVideoFrame(playUrl, timeMs, { sourceVideo, signal: ac.signal })
      .then((h) => {
        exportHandleRef.current = h;
        setExportVideo(h.video);
        setPreparing(false);
      })
      .catch((e) => {
        setPreparing(false);
        setError(e instanceof FrameExportError ? e.message : '无法加载截图画面');
      });

    return () => {
      ac.abort();
      disposeExportVideo(exportHandleRef.current);
      exportHandleRef.current = null;
      setExportVideo(null);
    };
  }, [open, playUrl, timeMs, sourceVideo]);

  const refreshPreview = useCallback(() => {
    const v = exportHandleRef.current?.video;
    if (!open || !v || preparing) return;
    setError(null);
    try {
      const canvas = renderFrameCanvas({
        video: v,
        subtitles,
        preset,
        panX,
      });
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
    } catch (e) {
      setPreviewUrl(null);
      setError(e instanceof FrameExportError ? e.message : '无法生成预览');
    }
  }, [open, preparing, subtitles, preset, panX]);

  useEffect(() => {
    if (!open || preparing) return;
    refreshPreview();
  }, [open, preparing, refreshPreview]);

  const footerHint = useMemo(() => {
    if (error?.includes('CORS')) return error;
    return '导出图在画面底部叠放英文与中文台词（与蒙版播放器一致）；「复制链接 / 复制文本」仍附带出处。';
  }, [error]);

  const onExport = async () => {
    const v = exportHandleRef.current?.video;
    if (!v) return;
    setExporting(true);
    setError(null);
    try {
      const canvas = renderFrameCanvas({
        video: v,
        subtitles,
        preset,
        panX,
      });
      const blob = await canvasToJpegBlob(canvas);
      downloadJpeg(blob, exportFilename(line.episode, timeMs, preset));
      onClose();
    } catch (e) {
      setError(e instanceof FrameExportError ? e.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="导出截图"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="flex max-h-[100dvh] w-full max-w-[min(100%,28rem)] flex-col overflow-hidden bg-surface shadow-lift sm:max-h-[min(92dvh,36rem)] sm:rounded-card">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <h2 className="text-base font-semibold text-ink">导出截图</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-pill px-2 py-1.5 text-sm font-medium text-ink hover:bg-brand-soft"
          >
            <CloseIcon />
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-control bg-black sm:aspect-video">
            {previewUrl ? (
              <img src={previewUrl} alt="截图预览" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-ink-sub">
                {error ?? (preparing ? '准备截图画面…' : '加载预览…')}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPreset(p.id);
                  if (p.id !== 'original') setPanX(0.5);
                }}
                className={`rounded-pill px-3 py-1.5 text-sm font-semibold transition active:scale-[0.98] ${
                  preset === p.id
                    ? 'bg-brand text-white shadow-glow'
                    : 'border border-line bg-surface text-ink hover:border-brand-fg'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {canPan && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">水平裁切位置</span>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(panX * 1000)}
                onChange={(e) => setPanX(Number(e.target.value) / 1000)}
                className="w-full accent-brand"
              />
              <span className="text-meta text-ink-faint">左右拖动以选择裁切区域（默认居中）</span>
            </label>
          )}

          {error && !error.includes('CORS') && (
            <p role="alert" className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <p className="text-meta text-ink-faint">{footerHint}</p>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-line px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-control border border-line py-2.5 text-sm font-semibold text-ink transition hover:border-brand-fg active:scale-[0.98]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={exporting || preparing || !exportVideo || !!error}
            onClick={() => void onExport()}
            className="flex-1 rounded-control bg-brand py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {exporting ? '导出中…' : '下载 JPG'}
          </button>
        </div>
      </div>
    </div>
  );
}
