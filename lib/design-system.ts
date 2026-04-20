export const colorPalette = {
  background: {
    primary: '#0B0B0F',
    deep: '#090B14',
    card: '#111118',
    elevated: '#17182B',
    input: '#181822',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#A1A1AA',
    muted: 'rgba(255,255,255,0.6)',
  },
  border: {
    soft: 'rgba(255,255,255,0.07)',
    strong: 'rgba(245,192,68,0.25)',
  },
  brand: {
    gold: '#F5C044',
    goldDeep: '#D9A92E',
    goldHover: '#FFD76A',
  },
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  },
} as const

export const spacingScale = {
  0: '0rem',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  14: '3.5rem',
  16: '4rem',
} as const

export const typographySystem = {
  fontFamily: {
    display: "'Manrope', 'Segoe UI', sans-serif",
    body: "'Inter', 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Consolas', monospace",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  lineHeight: {
    tight: '1.2',
    normal: '1.5',
    relaxed: '1.65',
  },
  weight: {
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
} as const

export const reusableComponents = {
  button: {
    base:
      'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C044] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0F] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]',
    primary:
      'h-11 px-6 bg-gradient-to-br from-[#F5C044] to-[#D9A92E] text-black hover:brightness-110 hover:shadow-[0_4px_20px_rgba(245,192,68,0.28)]',
    secondary:
      'h-11 px-6 border border-white/10 bg-[#181822] text-white hover:border-[#F5C044]/40 hover:bg-[#1E1E2E]',
  },
  card: {
    base:
      'rounded-2xl border border-white/10 bg-[#111118] shadow-[0_2px_12px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.25)]',
    padded: 'p-6',
    interactive: 'transition-all duration-200 hover:border-white/15 hover:shadow-[0_6px_24px_rgba(0,0,0,0.5)]',
  },
  input: {
    base:
      'h-11 w-full rounded-lg border border-white/10 bg-[#181822] px-4 text-base text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C044] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0F] disabled:opacity-50 disabled:cursor-not-allowed',
  },
} as const

export type ColorPalette = typeof colorPalette
export type SpacingScale = typeof spacingScale
export type TypographySystem = typeof typographySystem