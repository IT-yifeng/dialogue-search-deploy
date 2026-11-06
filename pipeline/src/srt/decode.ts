// 把字幕文件的字节还原成文本。
// 为什么不直接 readFile(..., 'utf8')：网上的中文字幕常见 GBK / UTF-16 编码，
// 按 UTF-8 硬读会得到满屏乱码，而且不会报错，很难事后发现。

export function decodeSubtitle(bytes: Uint8Array): string {
  // 先看 BOM：有 BOM 时编码是确定的
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);

  // 没有 UTF-16 BOM：优先按严格 UTF-8 解码（带 BOM 的 UTF-8 会被自动去掉 BOM）。
  // fatal 模式遇到非法字节会抛错，借此判断“这不是 UTF-8”。
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // GB18030 是 GBK 的超集，覆盖简体中文字幕最常见的旧编码
    return new TextDecoder('gb18030').decode(bytes);
  }
}
