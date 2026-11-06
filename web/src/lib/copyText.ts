// 复制 / 分享文本的拼装与写入剪贴板（手册 §7.3）。
import { formatEpisodeCode, formatTime } from './formatTime';

/** 片名：目前只有一部剧，所以用前端常量而不是加表字段（手册 §7.3） */
export const SERIES_TITLE = '生活大爆炸';

interface CitableLine {
  episode: { season: number; episode: number };
  startMs: number;
  en: string;
  zh: string;
}

/** 出处行：「—— 《片名》S02E05 12:03」。复制与分享都带上，且不提供关闭方式（手册 §4.2 第 5 条） */
export function formatCitation(line: Pick<CitableLine, 'episode' | 'startMs'>): string {
  return `—— 《${SERIES_TITLE}》${formatEpisodeCode(line.episode.season, line.episode.episode)} ${formatTime(line.startMs)}`;
}

/**
 * 每条三行：英文、中文、出处；条目之间空一行。
 * 一律中英对照，不跟随界面的语言模式——复制出去的文本脱离了页面，要自己读得懂。
 * 某一语言为空时省略那一行，不留空行，免得粘贴后出现莫名的断层。
 */
export function buildShareText(lines: CitableLine[]): string {
  return lines
    .map((l) => [l.en.trim(), l.zh.trim(), formatCitation(l)].filter((s) => s !== '').join('\n'))
    .join('\n\n');
}

/**
 * 写入剪贴板，返回是否成功。
 * navigator.clipboard 只在安全上下文（https / localhost）可用，用局域网 IP 的 http 访问时不存在，
 * 所以退回到“隐藏文本框 + execCommand”的老办法，保证两种环境都能复制。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限被拒或文档未聚焦：继续走兜底方案
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  // readonly 防止移动端弹出键盘；移出屏幕而不是 display:none，后者无法被选中
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  const active = document.activeElement as HTMLElement | null;
  ta.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
    // 把焦点还给原来的元素，否则对话框里的键盘操作会断掉
    active?.focus?.();
  }
}
