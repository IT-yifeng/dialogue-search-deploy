// 内联 SVG 图标。不引入图标库（规则：不加未经说明的依赖），用到的就这十来个。
// 统一 aria-hidden：图标都有文字或 aria-label 配合，不需要被读屏重复朗读。
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    width: '1em',
    height: '1em',
    ...props,
  };
}

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const PlayIcon = (p: IconProps) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
);

export const ReplayIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 3, ...p })}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const ShareIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m21 3-9.5 9.5" />
    <path d="M21 3 14.5 21l-3-8.5L3 9.5 21 3Z" />
  </svg>
);

export const CopyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
  </svg>
);

export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

export const SparkIcon = (p: IconProps) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
    <path d="M12 2.5 14 9l6.5 2L14 13l-2 6.5L10 13 3.5 11 10 9l2-6.5Z" />
  </svg>
);

export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.2v.1" />
  </svg>
);

export const FilmIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5" />
  </svg>
);

export const LayersIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const LanguagesIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 5h9M8.5 3v2M6 5c0 4 2.5 7 6 8M11 5c0 3.5-3 7-7 8.5" />
    <path d="m13 21 4-9 4 9M14.5 18h5" />
  </svg>
);

/** 品牌标识：渐变圆角方块 + 对话气泡，对应“台词”。Logo 本身是装饰，名称由旁边的文字提供 */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-[0.7rem] bg-brand-gradient text-white shadow-glow ${className}`}
    >
      <svg viewBox="0 0 24 24" width="62%" height="62%" fill="currentColor">
        <path d="M5 4h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6.2l-4.1 3.4A.8.8 0 0 1 7.4 19.8V17H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
      </svg>
    </span>
  );
}

/** 空态插画：放大镜 + 对话气泡。纯装饰，用品牌色浅底和描边，亮暗模式通用 */
export function SearchIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={className} fill="none">
      <rect x="14" y="22" width="92" height="58" rx="14" className="fill-brand-soft" />
      <path d="M34 80v16l18-16" className="fill-brand-soft" />
      <rect x="30" y="40" width="48" height="6" rx="3" className="fill-brand-fg/40" />
      <rect x="30" y="54" width="62" height="6" rx="3" className="fill-brand-fg/25" />
      <circle cx="108" cy="72" r="24" className="fill-surface stroke-brand-fg" strokeWidth="5" />
      <path d="m126 90 16 16" className="stroke-brand-fg" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
