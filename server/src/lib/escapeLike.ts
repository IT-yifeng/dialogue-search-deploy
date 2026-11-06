// 用户输入进入 SQL 模式匹配前的转义工具。
// 值本身仍然走参数化（$n）防注入；这里解决的是另一个问题：
// 用户输入的 % 和 _ 在 LIKE 里是通配符，不转义的话搜 "%" 会命中所有行。

/**
 * 转义 LIKE / ILIKE 里的通配符 \ % _，让它们按字面字符匹配。
 * 反斜杠必须一起转义，否则用户输入的 "\%" 会把我们加的转义符"吃掉"。
 * 配合 SQL 里的 ESCAPE '\' 使用。
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

/**
 * 转义 Postgres 正则（ARE）的元字符，用于整词匹配 \m...\M 的排序加权。
 * 不转义的话，搜 "a.b" 里的 "." 会被当成任意字符。
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
