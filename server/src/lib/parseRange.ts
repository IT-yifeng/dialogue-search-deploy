// 解析 HTTP Range 请求头（只支持单个字节区间，视频播放够用）。
// 单独成纯函数，是因为各种边界（开放区间、尾段、越界）最容易写错，需要单测覆盖。

export type RangeResult =
  /** 没带 Range，或格式无法理解：按 RFC 7233 应忽略它，返回完整内容 */
  | { kind: 'full' }
  /** 合法区间，start / end 都是闭区间的字节下标，且已限制在文件范围内 */
  | { kind: 'partial'; start: number; end: number }
  /** 语法合法但落在文件之外：应返回 416 */
  | { kind: 'unsatisfiable' };

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (header === undefined) return { kind: 'full' };
  // 多区间（"0-9,20-29"）浏览器播放视频不会发；遇到就退回完整内容，比实现 multipart 简单可靠
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return { kind: 'full' };
  const [, a = '', b = ''] = m;
  if (a === '' && b === '') return { kind: 'full' };

  let start: number;
  let end: number;
  if (a === '') {
    // 尾段："bytes=-500" 表示最后 500 字节
    const suffix = Number(b);
    if (suffix === 0 || size === 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    // 开放区间："bytes=100-" 一直读到文件末尾；终点超出文件大小时按末尾截断
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
    // 终点小于起点属于语法错误，按规范忽略
    if (b !== '' && Number(b) < start) return { kind: 'full' };
    if (start >= size) return { kind: 'unsatisfiable' };
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start, end };
}
