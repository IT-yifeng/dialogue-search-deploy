// 视频帧裁切几何（M8）：纯函数，便于单测。

export type AspectPreset = 'original' | '3:4' | '9:16' | '1:1';

/** 目标宽/高；原画幅为 null */
export function presetAspectRatio(preset: AspectPreset): number | null {
  switch (preset) {
    case 'original':
      return null;
    case '3:4':
      return 3 / 4;
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
  }
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 在源帧内计算裁切矩形。垂直始终居中；水平位置由 panX（0=最左，1=最右）决定。
 */
export function computeCropRect(
  sourceWidth: number,
  sourceHeight: number,
  preset: AspectPreset,
  panX: number,
): CropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: 0, y: 0, width: Math.max(0, sourceWidth), height: Math.max(0, sourceHeight) };
  }
  if (preset === 'original') {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }
  const ar = presetAspectRatio(preset)!;
  const clampedPan = Math.min(1, Math.max(0, panX));

  let cropW: number;
  let cropH: number;
  if (sourceWidth / sourceHeight > ar) {
    cropH = sourceHeight;
    cropW = cropH * ar;
  } else {
    cropW = sourceWidth;
    cropH = cropW / ar;
  }

  const maxPanX = Math.max(0, sourceWidth - cropW);
  const x = clampedPan * maxPanX;
  const y = (sourceHeight - cropH) / 2;
  return { x, y, width: cropW, height: cropH };
}

/** 水平方向是否还能拖动（原画幅或源宽等于裁切宽时为 0） */
export function maxHorizontalPan(sourceWidth: number, preset: AspectPreset, sourceHeight: number): number {
  if (preset === 'original') return 0;
  const ar = presetAspectRatio(preset);
  if (ar === null) return 0;
  const rect = computeCropRect(sourceWidth, sourceHeight, preset, 0);
  return Math.max(0, sourceWidth - rect.width);
}
