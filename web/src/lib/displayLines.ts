// 按语言模式决定一条台词 / 一集标题“显示什么”。
// 单独成纯函数，是因为“某一语言为空时怎么回退”这类边界规则需要单测，不适合埋在组件里。

export type LangMode = 'en' | 'zh' | 'both';

export interface DisplayLine {
  lang: 'en' | 'zh';
  text: string;
  /** 用户选的语言为空，临时拿另一种语言顶上；界面上要弱化，避免误以为是所选语言 */
  fallback: boolean;
}

export function pickDisplayLines(line: { en: string; zh: string }, mode: LangMode): DisplayLine[] {
  const hasEn = line.en.trim() !== '';
  const hasZh = line.zh.trim() !== '';

  if (mode === 'both') {
    const out: DisplayLine[] = [];
    if (hasEn) out.push({ lang: 'en', text: line.en, fallback: false });
    if (hasZh) out.push({ lang: 'zh', text: line.zh, fallback: false });
    return out;
  }

  const wantEn = mode === 'en';
  if (wantEn ? hasEn : hasZh) {
    return [{ lang: wantEn ? 'en' : 'zh', text: wantEn ? line.en : line.zh, fallback: false }];
  }
  // 所选语言没有内容：退到另一种，避免卡片空白
  if (wantEn ? hasZh : hasEn) {
    return [{ lang: wantEn ? 'zh' : 'en', text: wantEn ? line.zh : line.en, fallback: true }];
  }
  return [];
}

/** 集标题：按模式取，缺失的一方不显示；都缺返回空串 */
export function pickEpisodeTitle(
  ep: { titleEn: string | null; titleZh: string | null },
  mode: LangMode,
): string {
  const en = ep.titleEn?.trim() ?? '';
  const zh = ep.titleZh?.trim() ?? '';
  if (mode === 'en') return en || zh;
  if (mode === 'zh') return zh || en;
  return [en, zh].filter(Boolean).join(' / ');
}
