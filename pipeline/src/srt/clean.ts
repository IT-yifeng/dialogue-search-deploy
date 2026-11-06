import type { Cue, DraftLine } from '../types.js';

// ---- 广告 / 字幕组水印 -------------------------------------------------
// 只放“通用特征词”。注意避免误伤正常台词：
// 像“时间轴”“压制”本身是普通词，所以只匹配带冒号的署名形式（“时间轴：某某”）。
const AD_PATTERNS: RegExp[] = [
  /字幕组|字幕制作|字幕翻译|字幕校对|本字幕/,
  /(翻译|校对|时间轴|压制|后期|制作)[:：]/,
  /subtitles?\s+(by|provided)|subtitled\s+by|translated\s+by|synced?\s+(and|&)\s+corrected/i,
  /opensubtitles|addic7ed|assrt/i,
  // 中文片源常见的引流话术（公众号、扫码关注之类）
  /公众号|获取更多剧集|必属精品|扫码关注|扫描二维码/,
  /www\.|https?:\/\/|\b\w+\.(com|net|org)\b/i,
];

// 去掉 {\an8}、{\fs16\an2\b0} 之类的 ASS 格式标记
const ASS_TAG_RE = /\{\\[^}]*\}/g;
// 去掉 <i>、</font color=...> 等 HTML 标签
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
// 方括号、圆括号、全角括号里的内容：英文是音效（[laughs]），中文括号多是译者注（如“(海地首都)”），
// 两者都不是台词，留着会污染搜索结果。
const BRACKET_RES: RegExp[] = [/\[[^\]]*\]/g, /\([^)]*\)/g, /（[^）]*）/g, /【[^】]*】/g];
// 行首的说话人短横线
const DASH_RE = /^[-–—]+\s*/;
// 行内的说话人分隔：有的字幕把两个人的话写在同一行，中间用 " -" 隔开。
// 只在“空白 + 横线 + 字母/汉字”时才去：数字前的负号（-5）、连字符（well-known）、
// 两侧有空格的破折号（wait - what）都不会被误伤。
const INLINE_DASH_RE = /\s[-–—](?=[A-Za-z\u3400-\u9fff"'])/g;
// 全大写的说话人标签，如 “JOHN: ”。要求全大写，避免误伤 “Note: ...” 之类的正常句子
const SPEAKER_RE = /^[A-Z][A-Z0-9 .'’]{1,24}:\s+/;

/** 清洗单行文字；整行都是噪音时返回空串。 */
export function cleanLine(input: string): string {
  let s = input.replace(ASS_TAG_RE, '').replace(HTML_TAG_RE, '');
  // ♪ 后面通常是歌词，不是对白，整行丢弃
  if (/[♪♫]/.test(s)) return '';
  for (const re of BRACKET_RES) s = s.replace(re, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(DASH_RE, '').replace(SPEAKER_RE, '').replace(INLINE_DASH_RE, ' ').trim();
  if (AD_PATTERNS.some((re) => re.test(s))) return '';
  return s;
}

/**
 * 清洗整份字幕：逐行清洗，丢弃清洗后为空的条目，
 * 并把“文字完全相同且首尾相接”的相邻条目合并（部分字幕会把同一句拆成两条重复显示）。
 */
export function cleanCues(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const cue of cues) {
    const text = cue.text
      .split('\n')
      .map(cleanLine)
      .filter((l) => l !== '')
      .join('\n');
    if (text === '') continue;
    const prev = out.at(-1);
    if (prev && prev.text === text && cue.startMs <= prev.endMs + 100) {
      prev.endMs = Math.max(prev.endMs, cue.endMs);
      continue;
    }
    out.push({ startMs: cue.startMs, endMs: cue.endMs, text });
  }
  return out;
}

// ---- 合并断句 ----------------------------------------------------------
// 句末标点（允许后面跟引号或右括号）。省略号以 . 结尾，也算句末。
const SENTENCE_END_RE = /[.!?…。！？]["'”’)\]]*$/;
const MERGE_MAX_GAP_MS = 300;
const MERGE_MAX_SPAN_MS = 8000;

/**
 * 把被字幕拆成几条的同一句话合并回来，方便搜索和整句播放。
 *
 * 策略刻意保守：宁可少合并，也不要把两句话粘在一起。必须同时满足：
 *  1. 前一条英文没有句末标点；
 *  2. 两条间隔 ≤ 300ms；
 *  3. 后一条英文以小写字母开头（说明是在接着上一句说）；
 *  4. 合并后总时长 ≤ 8 秒（太长的片段播放体验差）。
 * 只看英文来判断：中文字幕通常不带标点，没法可靠判断。
 */
export function mergeBrokenLines(lines: DraftLine[]): DraftLine[] {
  const out: DraftLine[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    if (
      prev &&
      prev.en !== '' &&
      line.en !== '' &&
      !SENTENCE_END_RE.test(prev.en) &&
      line.startMs - prev.endMs <= MERGE_MAX_GAP_MS &&
      /^[a-z]/.test(line.en) &&
      line.endMs - prev.startMs <= MERGE_MAX_SPAN_MS
    ) {
      prev.endMs = Math.max(prev.endMs, line.endMs);
      prev.en = `${prev.en} ${line.en}`;
      prev.zh = [prev.zh, line.zh].filter((z) => z !== '').join(' ');
      continue;
    }
    out.push({ ...line });
  }
  return out;
}
