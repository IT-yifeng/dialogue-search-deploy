import type { ContextLine } from '../api/types';
import type { ClipRange } from '../components/ClipPlayer';
import { contextClipRange } from './contextClip';

/** 按播放头毫秒在上下文台词表里找当前应显示的一句（列表已按 idx 有序） */
export function lineAtTimeMs(lines: ContextLine[], timeMs: number): ContextLine | null {
  if (lines.length === 0) return null;
  const hit = lines.find((l) => timeMs >= l.startMs && timeMs <= l.endMs);
  if (hit) return hit;
  let last: ContextLine = lines[0]!;
  for (const l of lines) {
    if (l.startMs <= timeMs) last = l;
    else break;
  }
  return last;
}

export function isContextMergedClip(clip: ClipRange, lines: ContextLine[]): boolean {
  const merged = contextClipRange(lines);
  return clip.startMs === merged.startMs && clip.endMs === merged.endMs;
}
