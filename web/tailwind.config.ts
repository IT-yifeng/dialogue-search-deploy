import type { Config } from 'tailwindcss';

// 设计令牌（手册 §7.8）。颜色的真实取值是 index.css 里的 CSS 变量，亮 / 暗两套同名，
// 这里只做“语义名 → 变量”的映射，所以组件里写 bg-surface、text-ink 就能自动适配暗色，不需要到处写 dark:。
// 变量存成“空格分隔的 RGB 通道”，才能让 bg-brand/50 这类透明度写法继续生效。
const color = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 由 <html class="dark"> 控制（见 store/theme.ts），而不是只看系统偏好，这样才能手动切换
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // brand 是实心底色（白字对比度 ≥ 4.5:1）；品牌色“文字 / 图标”必须用 brand-fg，
        // 因为暗色下底色不够亮，直接拿来当文字会看不清
        brand: {
          DEFAULT: color('brand'),
          hover: color('brand-hover'),
          fg: color('brand-fg'),
          soft: color('brand-soft'),
        },
        surface: {
          DEFAULT: color('surface'),
          page: color('page'),
          muted: color('muted'),
        },
        ink: {
          DEFAULT: color('ink'),
          sub: color('ink-sub'),
          faint: color('ink-faint'),
        },
        line: color('line'),
        // 亮青：只用于光晕、渐隐网格、高亮下划线，对比度不够，不能当文字色
        glow: color('glow'),
        danger: {
          DEFAULT: color('danger'),
          soft: color('danger-soft'),
        },
      },
      fontFamily: {
        // 中文优先用系统字体，避免加载网络字体拖慢首屏
        sans: [
          'system-ui',
          '-apple-system',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          'sans-serif',
        ],
      },
      fontSize: {
        // 台词正文比普通正文大一档，是页面的视觉重心。
        // 不能叫 line：会和颜色令牌 line 同名，text-line 会同时命中字号与颜色
        dialogue: ['1.125rem', { lineHeight: '1.65' }],
        meta: ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      borderRadius: {
        card: '1rem',
        control: '0.75rem',
        pill: '9999px',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 27 36 / 0.04), 0 6px 16px rgb(15 27 36 / 0.06)',
        lift: '0 12px 28px rgb(15 27 36 / 0.12)',
        // 柔光只给搜索框和主按钮，避免整页都在发光
        glow: '0 8px 28px -6px rgb(var(--c-glow) / 0.45)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        // 播放键点击时向外扩散一圈，只播一次
        'pulse-once': {
          from: { boxShadow: '0 0 0 0 rgb(var(--c-glow) / 0.55)' },
          to: { boxShadow: '0 0 0 12px rgb(var(--c-glow) / 0)' },
        },
      },
      animation: {
        // 用 backwards 而不是 both：入场动画结束后不再“占着” transform，
        // 否则卡片 hover 上浮（也是 transform）会被动画的终态值盖住而失效
        'fade-up': 'fade-up 240ms ease-out backwards',
        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-once': 'pulse-once 600ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
