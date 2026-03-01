import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Luxury dark theme color system
        background: '#0B0B0F',
        'surface-elevated': '#111118',
        'surface-card': '#151520',
        gold: '#F5C044',
        'gold-hover': '#FFD76A',
        'text-primary': '#FFFFFF',
        'text-secondary': '#A1A1AA',
        'border-soft': 'rgba(255,255,255,0.06)',
        'border-glass': 'rgba(255,255,255,0.12)',
        // Remove all white/gray/harsh borders
        // Accent and destructive for completeness
        accent: '#F5C044',
        'accent-hover': '#FFD76A',
        destructive: '#EF4444',
        // For glassmorphism overlays
        glass: 'rgba(21,21,32,0.85)',
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
