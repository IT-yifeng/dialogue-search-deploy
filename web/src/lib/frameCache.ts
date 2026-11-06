// §7.9：同一台词的截图缓存在 sessionStorage，减轻 9 宫格重复解码。
const PREFIX = 'lineFrame:';

export function getCachedFrame(lineId: number): string | null {
  try {
    return sessionStorage.getItem(PREFIX + lineId);
  } catch {
    return null;
  }
}

export function setCachedFrame(lineId: number, dataUrl: string): void {
  try {
    sessionStorage.setItem(PREFIX + lineId, dataUrl);
  } catch {
    // 配额满时静默失败
  }
}
