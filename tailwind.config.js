/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        ink: 'hsl(var(--ink) / <alpha-value>)',
        sub: 'hsl(var(--sub) / <alpha-value>)',
        faint: 'hsl(var(--faint) / <alpha-value>)',
        line: 'hsl(var(--line) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-ink': 'hsl(var(--accent-ink) / <alpha-value>)',
        pos: 'hsl(var(--pos) / <alpha-value>)',
        neg: 'hsl(var(--neg) / <alpha-value>)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        glass: '0 1px 0 0 hsl(0 0% 100% / 0.04) inset, 0 8px 30px -12px hsl(220 60% 4% / 0.6)',
        lift: '0 18px 40px -16px hsl(222 80% 4% / 0.7)',
        fab: '0 10px 30px -6px hsl(var(--accent) / 0.55)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'sheet-up': { from: { transform: 'translateY(8%)', opacity: '0.6' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease',
        'sheet-up': 'sheet-up .22s cubic-bezier(.22,1,.36,1)',
      },
    },
  },
  plugins: [],
}
