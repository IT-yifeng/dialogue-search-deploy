// 查询参数解析：把字符串参数严格转成整数，不合法统一抛 400。
// 不用 Number() 直接转，是因为它会把 "" 变 0、"1e3" 变 1000、" 5 " 变 5，这些都不该被放行。
import { badRequest } from './httpError.js';

export interface IntRule {
  name: string;
  min: number;
  max: number;
}

/** 参数缺省或为空串时返回 undefined */
export function parseOptionalInt(raw: string | undefined, rule: IntRule): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d+$/.test(raw)) throw badRequest(`${rule.name} 必须是整数`);
  const n = Number(raw);
  // 同时挡住超出 JS 安全整数的值，避免精度丢失后查到别的行
  if (!Number.isSafeInteger(n) || n < rule.min || n > rule.max) {
    throw badRequest(`${rule.name} 需要在 ${rule.min}～${rule.max} 之间`);
  }
  return n;
}

export function parseIntWithDefault(raw: string | undefined, rule: IntRule, fallback: number): number {
  return parseOptionalInt(raw, rule) ?? fallback;
}
