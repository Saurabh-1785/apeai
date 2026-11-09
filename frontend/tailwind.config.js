/** @type {import('tailwindcss').Config} */
const tone = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // App tokens (light/dark values live in app/globals.css)
        paper: tone('paper'),
        card: tone('card'),
        stone: tone('stone'),
        line: { DEFAULT: tone('line'), strong: tone('line-strong') },
        ink: { DEFAULT: tone('ink'), 2: tone('ink-2'), 3: tone('ink-3') },
        brand: tone('brand'),
        success: tone('success'),
        warning: tone('warning'),
        danger: tone('danger'),
        info: tone('info'),
        ai: tone('ai'),
        night: tone('night'),
        moon: tone('moon'),

        // Landing page tokens (defined in components/landing/landing.css)
        lp: {
          ink: 'var(--lp-ink)',
          ink2: 'var(--lp-ink-2)',
          ink3: 'var(--lp-ink-3)',
          paper: 'var(--lp-paper)',
          stone: 'var(--lp-stone)',
          card: 'var(--lp-card)',
          line: 'var(--lp-line)',
          linestrong: 'var(--lp-line-strong)',
          night: 'var(--lp-night)',
          dusk: 'var(--lp-dusk)',
          void: 'var(--lp-void)',
          moon: 'var(--lp-moon)',
          moon2: 'var(--lp-moon-2)',
          nightline: 'var(--lp-night-line)',
          coral: 'var(--lp-coral)',
          blue: 'var(--lp-blue)',
          green: 'var(--lp-green)',
          amber: 'var(--lp-amber)',
          violet: 'var(--lp-violet)',
          coralL: 'var(--lp-coral-l)',
          blueL: 'var(--lp-blue-l)',
          greenL: 'var(--lp-green-l)',
          amberL: 'var(--lp-amber-l)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-subtle': 'pulseSubtle 2.5s infinite ease-in-out',
        'draw-line': 'drawLine 2s ease-in-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.02)' },
        },
        drawLine: {
          '0%': { strokeDashoffset: '100%' },
          '100%': { strokeDashoffset: '0%' },
        },
      },
    },
  },
  plugins: [],
}
