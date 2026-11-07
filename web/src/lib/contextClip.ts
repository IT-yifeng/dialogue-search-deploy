import type { ContextLine } from '../api/types';
import type { ClipRange } from '../components/ClipPlayer';

/** 上下文列表合并为一段连续播放区间（含当前句及前后各 2 句） */
export function contextClipRange(lines: ContextLine[]): ClipRange {
  if (lines.length === 0) return { startMs: 0, endMs: 0 };
  let startMs = lines[0]!.startMs;
  let endMs = lines[0]!.endMs;
  for (const l of lines) {
    if (l.startMs < startMs) startMs = l.startMs;
    if (l.endMs > endMs) endMs = l.endMs;
  }
  return { startMs, endMs };
}
