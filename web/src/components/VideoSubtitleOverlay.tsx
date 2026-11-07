// 蒙版播放器内双语字幕：叠在 16:9 画面底部居中，留出原生控制条高度
import { pickDisplayLines, type LangMode } from '../lib/displayLines';
import { HighlightText } from './HighlightText';

interface LineText {
  en: string;
  zh: string;
}

interface Props {
  line: LineText;
  terms: string[];
  /** 分享页跟顶栏语言；蒙版默认双语 */
  mode?: LangMode;
}

export function VideoSubtitleOverlay({ line, terms, mode = 'both' }: Props) {
  const display = pickDisplayLines(line, mode);
  if (display.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/92 via-black/55 to-transparent px-3 pb-[3.25rem] pt-8 text-center sm:px-5 sm:pb-14 sm:pt-10"
      aria-live="polite"
    >
      <div className="mx-auto max-w-[36rem] space-y-0.5 sm:space-y-1">
        {display.map((l) => (
          <p
            key={l.lang}
            lang={l.lang === 'en' ? 'en' : 'zh-CN'}
            className={`text-sm leading-snug text-white drop-shadow-[0_1px_3px_rgb(0_0_0/0.95)] sm:text-base sm:leading-relaxed ${
              l.lang === 'zh' ? 'text-white/95' : 'font-semibold'
            }`}
          >
            <HighlightText text={l.text} terms={terms} />
          </p>
        ))}
      </div>
    </div>
  );
}
