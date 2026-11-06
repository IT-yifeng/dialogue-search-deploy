import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EpisodeKey } from './types.js';

export type SubLang = 'en' | 'zh' | 'bilingual';

export interface EpisodeSources extends EpisodeKey {
  /** 形如 S01E01，作为全管线统一的集标识 */
  id: string;
  /** 中英合一的字幕文件 */
  bilingual?: string;
  /** 纯英文字幕文件 */
  en?: string;
  /** 纯中文字幕文件 */
  zh?: string;
}

export interface VideoFile extends EpisodeKey {
  id: string;
  path: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function episodeId(key: EpisodeKey): string {
  return `S${pad2(key.season)}E${pad2(key.episode)}`;
}

const EN_TAGS = new Set(['en', 'eng', 'english']);
const ZH_TAGS = new Set(['zh', 'chs', 'cht', 'chi', 'cn', 'chinese', 'zh-cn', 'zh-tw', 'zh-hans', 'zh-hant']);
const BILINGUAL_RE = /^(bilingual|bi|dual|(zh|chs|cht|cn)[\s._&+-]*(en|eng)|(en|eng)[\s._&+-]*(zh|chs|cht|cn))$/;

/**
 * 从文件名里识别季集与语言：
 *  S01E01.srt → 双语合一；S01E01.en.srt / "Show S01E01-EN.srt" → 英文；.zh / .chs → 中文。
 * 季集之前允许有任意前缀（片名、字幕组名），所以不要求用户改名。
 * 认不出季集或后缀的返回 null，调用方会忽略这些文件。
 */
export function parseEpisodeFile(fileName: string): (EpisodeKey & { lang: SubLang }) | null {
  const base = path.parse(fileName).name;
  const m = /S(\d{1,2})E(\d{1,3})(.*)$/i.exec(base);
  if (!m) return null;
  const tag = m[3]!.replace(/^[\s._-]+/, '').toLowerCase();
  let lang: SubLang;
  if (tag === '') lang = 'bilingual';
  else if (EN_TAGS.has(tag)) lang = 'en';
  else if (ZH_TAGS.has(tag)) lang = 'zh';
  else if (BILINGUAL_RE.test(tag)) lang = 'bilingual';
  else return null;
  return { season: Number(m[1]), episode: Number(m[2]), lang };
}

const byKey = (a: EpisodeKey, b: EpisodeKey): number => a.season - b.season || a.episode - b.episode;

function listFiles(dir: string): string[] {
  // 目录不存在不算错误：用户可能还没放素材，由调用方给出友好提示
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/** 扫描字幕目录，把同一集的多个文件归到一起，按季集排序。 */
export function scanSubs(dir: string): EpisodeSources[] {
  const map = new Map<string, EpisodeSources>();
  for (const name of listFiles(dir)) {
    if (path.extname(name).toLowerCase() !== '.srt') continue;
    const info = parseEpisodeFile(name);
    if (!info) continue;
    const id = episodeId(info);
    const entry = map.get(id) ?? { id, season: info.season, episode: info.episode };
    const full = path.join(dir, name);
    if (info.lang === 'bilingual') entry.bilingual = full;
    else entry[info.lang] = full;
    map.set(id, entry);
  }
  return [...map.values()].sort(byKey);
}

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.m4v']);

/** 扫描视频目录。视频文件名后缀可能很杂（如 .1080p），所以只取季集。 */
export function scanVideos(dir: string): VideoFile[] {
  const out: VideoFile[] = [];
  for (const name of listFiles(dir)) {
    if (!VIDEO_EXTS.has(path.extname(name).toLowerCase())) continue;
    const m = /S(\d{1,2})E(\d{1,3})/i.exec(path.parse(name).name);
    if (!m) continue;
    const key = { season: Number(m[1]), episode: Number(m[2]) };
    out.push({ ...key, id: episodeId(key), path: path.join(dir, name) });
  }
  return out.sort(byKey);
}

/**
 * 读取手填的时间偏移量，如 {"S01E01": -1500}（毫秒，正数表示字幕整体推迟）。
 * 文件不存在时视为没有偏移；内容不是数字时直接报错，避免静默地把时间戳平移成 NaN。
 */
export function loadOffsets(file: string): Record<string, number> {
  if (!existsSync(file)) return {};
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`${file} 必须是 {"S01E01": 毫秒数} 形式的对象`);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${file} 中 ${k} 的值不是数字：${JSON.stringify(v)}`);
    out[k.toUpperCase()] = Math.round(v);
  }
  return out;
}
