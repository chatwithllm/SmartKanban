/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:   'rgb(var(--canvas) / <alpha-value>)',
        surface:  'rgb(var(--surface) / <alpha-value>)',
        card:     'rgb(var(--card) / <alpha-value>)',
        ceramic:  'rgb(var(--ceramic) / <alpha-value>)',
        ink:      'rgb(var(--ink) / <alpha-value>)',
        'ink-2':  'rgb(var(--ink-2) / <alpha-value>)',
        'ink-3':  'rgb(var(--ink-3) / <alpha-value>)',
        'ink-soft':     'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-rev':      'rgb(var(--ink-rev) / <alpha-value>)',
        'ink-rev-soft': 'rgb(var(--ink-rev-soft) / <alpha-value>)',
        violet:        'rgb(var(--violet) / <alpha-value>)',
        'violet-tint': 'rgb(var(--violet-tint) / <alpha-value>)',
        danger:  'rgb(var(--danger) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        red:     'rgb(var(--red) / <alpha-value>)',
        gold:    'rgb(var(--gold) / <alpha-value>)',
        'green-house':     'rgb(var(--green-house) / <alpha-value>)',
        'green-starbucks': 'rgb(var(--green-starbucks) / <alpha-value>)',
        'green-uplift':    'rgb(var(--green-uplift) / <alpha-value>)',
        'green-accent':    'rgb(var(--green-accent) / <alpha-value>)',
      },
      fontSize: {
        '1': ['11px', { lineHeight: '1.4' }],
        '2': ['12.5px', { lineHeight: '1.45' }],
        '3': ['14px', { lineHeight: '1.5' }],
      },
      letterSpacing: {
        tight2: '-0.015em',
        tight3: '-0.025em',
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
