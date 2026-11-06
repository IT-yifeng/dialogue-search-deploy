import type { LangMode } from '../lib/displayLines';
import { useLangStore } from '../store/lang';

const OPTIONS: Array<{ mode: LangMode; label: string }> = [
  { mode: 'en', label: '英' },
  { mode: 'zh', label: '中' },
  { mode: 'both', label: '双语' },
];

export function LangToggle() {
  const mode = useLangStore((s) => s.mode);
  const setMode = useLangStore((s) => s.setMode);

  return (
    <div role="group" aria-label="显示语言" className="inline-flex rounded-pill bg-surface-muted p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          aria-pressed={mode === o.mode}
          onClick={() => setMode(o.mode)}
          className={`rounded-pill px-3 py-1 text-sm transition active:scale-[0.98] ${
            mode === o.mode ? 'bg-surface font-semibold text-brand-fg shadow-soft' : 'text-ink-sub hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
