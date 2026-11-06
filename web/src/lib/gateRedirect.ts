// 口令页跳转相关的纯函数。单独成文件是为了不依赖 React 就能单测。

/**
 * 登录成功后要回到哪里。next 来自 URL，属于用户可控输入：
 * 如果直接 navigate，别人构造 /gate?next=//evil.com 就能让用户登录后跳去钓鱼站（开放重定向）。
 * 所以只接受站内路径：以单个 / 开头，且不能是 // 或 /\（浏览器会把它们当成协议相对地址）。
 */
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  // 回到口令页本身没有意义，还可能形成跳转循环
  if (raw === '/gate' || raw.startsWith('/gate?') || raw.startsWith('/gate/')) return '/';
  return raw;
}

/** 未登录时跳转的目标：把当前页面记在 next 里，登录后回来 */
export function gatePathFor(current: { pathname: string; search: string; hash?: string }): string {
  // 已经在口令页就不再嵌套 next，避免 /gate?next=/gate?next=... 越滚越长
  if (current.pathname === '/gate') return '/gate';
  const target = `${current.pathname}${current.search}${current.hash ?? ''}`;
  return target === '/' ? '/gate' : `/gate?next=${encodeURIComponent(target)}`;
}
