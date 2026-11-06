import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

export interface TranscodeOptions {
  /** -map 的音轨选择器，见 pickAudioMap */
  audioMap: string;
  /** x264 预设；默认 slow（画质/体积最优，手册 §4.3），--fast 时用 veryfast */
  preset?: string;
}

/**
 * 转码参数，对应手册 §4.3 的命令。做成纯函数是为了能单测，
 * 并且全程用数组传参、不拼 shell 字符串，路径里有空格或中文也不会出问题。
 *
 * 关键点：
 *  - -g 24 -keyint_min 24 -sc_threshold 0：固定每秒一个关键帧，浏览器才能精准跳到任意台词；
 *  - -movflags +faststart：索引放文件头，才能边下边播；
 *  - -sn：去掉内封字幕，字幕已经单独入库。
 */
export function buildTranscodeArgs(input: string, output: string, opts: TranscodeOptions): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-stats',
    '-y',
    '-i', input,
    '-map', '0:v:0',
    '-map', opts.audioMap,
    '-vf', 'scale=-2:480',
    '-c:v', 'libx264', '-crf', '26', '-preset', opts.preset ?? 'slow',
    '-g', '24', '-keyint_min', '24', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
    '-sn',
    '-movflags', '+faststart',
    output,
  ];
}

/** 抽取内封的文本字幕（第 subIndex 条字幕流）为 srt。图片字幕（PGS/VobSub）不适用，需要 OCR。 */
export function buildExtractSubArgs(input: string, output: string, subIndex = 0): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', `0:s:${subIndex}`, '-c:s', 'srt', output];
}

function capture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${bin} 退出码 ${code}：${err.trim()}`))));
  });
}

function runInherit(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // 继承终端输出，转码进度（-stats）才能实时显示给用户
    const child = spawn(bin, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${bin} 退出码 ${code}`))));
  });
}

export async function ensureFfmpeg(): Promise<void> {
  try {
    await capture('ffmpeg', ['-version']);
    await capture('ffprobe', ['-version']);
  } catch {
    throw new Error('未找到 ffmpeg / ffprobe，请先安装：brew install ffmpeg');
  }
}

/** 视频总时长（毫秒）；取不到时返回 null。 */
export async function probeDurationMs(file: string): Promise<number | null> {
  const out = await capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
  const sec = Number.parseFloat(out.trim());
  return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
}

/**
 * 选音轨：优先英文音轨（手册 §4.3）。
 * 不能像手册早期版本那样写 `0:a:m:language:eng?`：ffmpeg 9 会把末尾的 ? 当成语言值的一部分，
 * 直接报 "matches no streams"。而去掉 ? 又有新问题——片源没打语言标签时会报错。
 * 所以先用 ffprobe 探测：有英文标签才用元数据选择器，否则退回第一条音轨（加 ? 容忍无音轨的片源）。
 */
export async function pickAudioMap(file: string): Promise<string> {
  const out = await capture('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream_tags=language', '-of', 'csv=p=0', file]);
  const hasEnglish = out.split('\n').some((l) => l.trim().toLowerCase() === 'eng');
  return hasEnglish ? '0:a:m:language:eng' : '0:a:0?';
}

/**
 * 转码到 output。先写到 .tmp.mp4，成功后再改名：
 * 中途被中断（Ctrl+C、断电）也不会留下一个看似完整的半成品，下次重跑不会被“已存在”误跳过。
 */
export async function transcodeFile(input: string, output: string, opts: { preset?: string } = {}): Promise<void> {
  const tmp = output.replace(/\.mp4$/, '.tmp.mp4');
  mkdirSync(path.dirname(output), { recursive: true });
  const audioMap = await pickAudioMap(input);
  try {
    await runInherit('ffmpeg', buildTranscodeArgs(input, tmp, { audioMap, preset: opts.preset }));
    renameSync(tmp, output);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
