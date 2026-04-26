/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:           'rgb(var(--canvas) / <alpha-value>)',
        ceramic:          'rgb(var(--ceramic) / <alpha-value>)',
        card:             'rgb(var(--card) / <alpha-value>)',
        'neutral-cool':   'rgb(var(--neutral-cool) / <alpha-value>)',
        'gold-lightest':  'rgb(var(--gold-lightest) / <alpha-value>)',
        ink:              'rgb(var(--ink) / <alpha-value>)',
        'ink-soft':       'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-rev':        'rgb(var(--ink-rev) / <alpha-value>)',
        'ink-rev-soft':   'rgb(var(--ink-rev-soft) / <alpha-value>)',
        'ink-rewards':    'rgb(var(--ink-rewards) / <alpha-value>)',
        'green-starbucks':'rgb(var(--green-starbucks) / <alpha-value>)',
        'green-accent':   'rgb(var(--green-accent) / <alpha-value>)',
        'green-house':    'rgb(var(--green-house) / <alpha-value>)',
        'green-uplift':   'rgb(var(--green-uplift) / <alpha-value>)',
        'green-light':    'rgb(var(--green-light) / <alpha-value>)',
        gold:             'rgb(var(--gold) / <alpha-value>)',
        red:              'rgb(var(--red) / <alpha-value>)',
        yellow:           'rgb(var(--yellow) / <alpha-value>)',
      },
      boxShadow: {
        card:        'var(--shadow-card)',
        'card-hover':'var(--shadow-card-hover)',
        'card-drag': 'var(--shadow-card-drag)',
        'app-bar':   'var(--shadow-app-bar)',
        'fab-base':  'var(--shadow-fab-base)',
        'fab-ambient':'var(--shadow-fab-ambient)',
        toast:       'var(--shadow-toast)',
        modal:       'var(--shadow-modal)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
        sheet: '12px 12px 0 0',
      },
      fontFamily: {
        sans:   ['Nunito Sans', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        serif:  ['Iowan Old Style', 'Source Serif Pro', 'Georgia', 'serif'],
        script: ['Kalam', 'Comic Sans MS', 'cursive'],
      },
      letterSpacing: {
        tight2: '-0.01em',
      },
      fontSize: {
        // Anchored to 1rem = 10px (set via html font-size: 62.5%)
        '1':  ['1.3rem',  { lineHeight: '1.5' }],
        '2':  ['1.4rem',  { lineHeight: '1.5' }],
        '3':  ['1.6rem',  { lineHeight: '1.5' }],
        '8':  ['2.8rem',  { lineHeight: '1.2' }],
        '9':  ['3.6rem',  { lineHeight: '1.2' }],
        '10': ['5.0rem',  { lineHeight: '1.2' }],
      },
    },
  },
  safelist: [
    'bg-red/5', 'border-red', 'text-red',
    'bg-gold-lightest', 'border-gold', 'text-gold',
    'bg-ceramic', 'text-ink-soft',
  ],
  plugins: [],
};
