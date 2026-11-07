// 分析会话 ID：标签页级 UUID，供 X-Session-Id 与取用事件关联（M7 F10）。
const KEY = 'analyticsSessionId';

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getAnalyticsSessionId(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const prev = sessionStorage.getItem(KEY);
    if (prev && prev.trim() !== '') return prev.trim();
    const id = randomUuid();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return null;
  }
}
