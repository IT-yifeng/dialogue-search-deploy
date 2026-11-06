// 集中读取并校验环境变量。
// 配置有误时直接抛错让进程启动失败，避免问题拖到上线后才暴露。
// 必填项（DATABASE_URL 等）也在这里校验；后续里程碑新增的变量同样放这里。
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  /** 服务运行时使用的 Postgres 连接串（Neon 用池化地址） */
  databaseUrl: string;
  /** 素材存储驱动：local 仅限本地开发，线上必须用 r2 */
  storageDriver: 'local' | 'r2';
  /** r2 驱动的凭据；storageDriver 为 local 时为 null */
  r2: R2Config | null;
  /** 站点口令（门禁） */
  sitePasscode: string;
  /** 门禁 cookie 的签名密钥 */
  cookieSecret: string;
  /** local 驱动读取视频的目录（默认 <仓库根>/work/mp4，与管线输出位置一致） */
  mediaDir: string;
  /** 站点外部地址，用来拼分享链接；不带末尾斜杠 */
  publicBaseUrl: string;
}

function parseNodeEnv(raw: string | undefined): Config['nodeEnv'] {
  if (raw === undefined || raw === '') return 'development';
  if (raw === 'development' || raw === 'production' || raw === 'test') return raw;
  throw new Error(`NODE_ENV 取值无效：${raw}（可选 development / production / test）`);
}

function parsePort(raw: string | undefined): number {
  // 默认 8080，与 Dockerfile 中的 EXPOSE 保持一致
  if (raw === undefined || raw === '') return 8080;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 取值无效：${raw}（需要 1～65535 的整数）`);
  }
  return port;
}

function parseDatabaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    throw new Error('缺少 DATABASE_URL：请复制 .env.example 为 .env 并填写，或在 .env.local 里设置');
  }
  return raw;
}

function parseStorageDriver(raw: string | undefined, nodeEnv: Config['nodeEnv']): Config['storageDriver'] {
  const driver = raw === undefined || raw === '' ? 'local' : raw;
  if (driver !== 'local' && driver !== 'r2') {
    throw new Error(`STORAGE_DRIVER 取值无效：${raw}（可选 local / r2）`);
  }
  // local 驱动签出的 /media/... 地址要过门禁，分享页的免口令访客会播不出来；
  // 与其上线后才发现，不如生产环境直接拒绝启动
  if (driver === 'local' && nodeEnv === 'production') {
    throw new Error('生产环境不能使用 STORAGE_DRIVER=local：请改为 r2 并填写 R2_* 变量');
  }
  return driver;
}

function parseR2(env: NodeJS.ProcessEnv, driver: Config['storageDriver']): R2Config | null {
  if (driver !== 'r2') return null;
  const pick = (name: string): string => {
    const v = env[name]?.trim();
    if (!v) throw new Error(`STORAGE_DRIVER=r2 时必须设置 ${name}`);
    return v;
  };
  return {
    accountId: pick('R2_ACCOUNT_ID'),
    accessKeyId: pick('R2_ACCESS_KEY_ID'),
    secretAccessKey: pick('R2_SECRET_ACCESS_KEY'),
    bucket: pick('R2_BUCKET'),
  };
}

// .env.example 里的占位值：生产环境若还是它们，等于没设门禁，必须拒绝启动
const PLACEHOLDER_PASSCODE = 'change-me';
const PLACEHOLDER_SECRET_PREFIX = 'replace-with-a-random-string';
const MIN_SECRET_LENGTH = 32;

function parseSitePasscode(raw: string | undefined, nodeEnv: Config['nodeEnv']): string {
  const v = raw?.trim() ?? '';
  if (nodeEnv === 'production') {
    if (v === '' || v === PLACEHOLDER_PASSCODE) throw new Error('生产环境必须设置 SITE_PASSCODE，且不能使用示例占位值');
    return v;
  }
  // 开发 / 测试环境没配就用占位值，开箱即用；这个值不会出现在生产
  return v === '' ? PLACEHOLDER_PASSCODE : v;
}

function parseCookieSecret(raw: string | undefined, nodeEnv: Config['nodeEnv']): string {
  const v = raw?.trim() ?? '';
  if (nodeEnv === 'production') {
    if (v.length < MIN_SECRET_LENGTH || v.startsWith(PLACEHOLDER_SECRET_PREFIX)) {
      throw new Error(`生产环境的 COOKIE_SECRET 必须是 ${MIN_SECRET_LENGTH} 位以上的随机串，且不能使用示例占位值`);
    }
    return v;
  }
  return v === '' ? `${PLACEHOLDER_SECRET_PREFIX}-for-local-development-only` : v;
}

function parsePublicBaseUrl(raw: string | undefined, nodeEnv: Config['nodeEnv']): string {
  if (raw === undefined || raw.trim() === '') {
    // 开发默认指向 Vite（分享页由前端路由渲染）；线上缺失会生成指向 localhost 的死链接，宁可启动失败
    if (nodeEnv === 'production') throw new Error('缺少 PUBLIC_BASE_URL：生产环境必须填写站点外部地址');
    return 'http://localhost:5173';
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`PUBLIC_BASE_URL 取值无效：${raw}（需要形如 https://example.com 的完整地址）`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`PUBLIC_BASE_URL 只支持 http / https：${raw}`);
  }
  return raw.trim().replace(/\/+$/, '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const storageDriver = parseStorageDriver(env.STORAGE_DRIVER, nodeEnv);
  return {
    nodeEnv,
    port: parsePort(env.PORT),
    databaseUrl: parseDatabaseUrl(env.DATABASE_URL),
    storageDriver,
    r2: parseR2(env, storageDriver),
    sitePasscode: parseSitePasscode(env.SITE_PASSCODE, nodeEnv),
    cookieSecret: parseCookieSecret(env.COOKIE_SECRET, nodeEnv),
    mediaDir: env.MEDIA_DIR?.trim() || path.resolve(import.meta.dirname, '../../work/mp4'),
    publicBaseUrl: parsePublicBaseUrl(env.PUBLIC_BASE_URL, nodeEnv),
  };
}

/**
 * 本地开发时从仓库根目录读取 .env 与 .env.local（Neon 自动生成）。
 * process.loadEnvFile 不会覆盖已存在的变量，所以优先级是：真实环境变量 > .env > .env.local。
 * 线上（Docker）没有这些文件，existsSync 判断会直接跳过。
 * 与 pipeline、db/migrate 各写一份而不共用代码，是因为手册 §3.2 规定 server 与 pipeline 互不引用。
 */
function loadEnvFiles(): void {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  for (const name of ['.env', '.env.local']) {
    const file = path.join(repoRoot, name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

loadEnvFiles();
export const config = loadConfig();
