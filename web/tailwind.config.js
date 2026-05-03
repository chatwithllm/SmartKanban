/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:   'rgb(var(--canvas) / <alpha-value>)',
        surface:  'rgb(var(--surface) / <alpha-value>)',
        ink:      'rgb(var(--ink) / <alpha-value>)',
        'ink-2':  'rgb(var(--ink-2) / <alpha-value>)',
        'ink-3':  'rgb(var(--ink-3) / <alpha-value>)',
        violet:   'rgb(var(--violet) / <alpha-value>)',
        'violet-tint': 'rgb(var(--violet-tint) / <alpha-value>)',
        danger:   'rgb(var(--danger) / <alpha-value>)',
        success:  'rgb(var(--success) / <alpha-value>)',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Spectral', 'Iowan Old Style', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: 'var(--r-card)',
        md:   'var(--r-md)',
        sm:   'var(--r-sm)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        '1': 'var(--sh-1)',
        '2': 'var(--sh-2)',
        '3': 'var(--sh-3)',
      },
    },
  },
  plugins: [],
};
