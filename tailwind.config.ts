import type { Config } from 'tailwindcss'

const colorWithOpacity = (variable: string) => `hsl(var(${variable}) / <alpha-value>)`

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      spacing: {
        'ds-1': 'var(--space-1)',
        'ds-2': 'var(--space-2)',
        'ds-3': 'var(--space-3)',
        'ds-4': 'var(--space-4)',
        'ds-5': 'var(--space-5)',
        'ds-6': 'var(--space-6)',
        'ds-8': 'var(--space-8)',
        'ds-10': 'var(--space-10)',
        'ds-12': 'var(--space-12)',
        'ds-14': 'var(--space-14)',
        'ds-16': 'var(--space-16)',
      },
      fontSize: {
        'display': ['var(--type-4xl)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'heading': ['var(--type-2xl)', { lineHeight: '1.2' }],
        'body': ['var(--type-base)', { lineHeight: '1.5' }],
        'caption': ['var(--type-sm)', { lineHeight: '1.4' }],
      },
      colors: {
        background: colorWithOpacity('--background'),
        foreground: colorWithOpacity('--foreground'),
        card: colorWithOpacity('--card'),
        'card-foreground': colorWithOpacity('--card-foreground'),
        popover: colorWithOpacity('--popover'),
        'popover-foreground': colorWithOpacity('--popover-foreground'),
        primary: colorWithOpacity('--primary'),
        'primary-foreground': colorWithOpacity('--primary-foreground'),
        secondary: colorWithOpacity('--secondary'),
        'secondary-foreground': colorWithOpacity('--secondary-foreground'),
        muted: colorWithOpacity('--muted'),
        'muted-foreground': colorWithOpacity('--muted-foreground'),
        accent: colorWithOpacity('--accent'),
        'accent-foreground': colorWithOpacity('--accent-foreground'),
        destructive: colorWithOpacity('--destructive'),
        'destructive-foreground': colorWithOpacity('--destructive-foreground'),
        border: colorWithOpacity('--border'),
        input: colorWithOpacity('--input'),
        ring: colorWithOpacity('--ring'),
        surface: colorWithOpacity('--surface'),
        'surface-card': colorWithOpacity('--surface-card'),
        'surface-elevated': colorWithOpacity('--surface-elevated'),
        gold: colorWithOpacity('--gold'),
        'gold-deep': colorWithOpacity('--gold-deep'),
        'gold-foreground': colorWithOpacity('--gold-foreground'),
        success: colorWithOpacity('--success'),
        warning: colorWithOpacity('--warning'),
        'text-primary': colorWithOpacity('--foreground'),
        'text-secondary': colorWithOpacity('--muted-foreground'),
        'border-soft': colorWithOpacity('--border'),
        'border-glass': colorWithOpacity('--border'),
        glass: colorWithOpacity('--card'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
