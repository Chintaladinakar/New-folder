/** @type {import('tailwindcss').Config} */

// Every colour is a CSS variable (an RGB triplet) so themes and accent colours switch at runtime.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  // Paths relative to this file, not the working directory.
  content: { relative: true, files: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'] },
  darkMode: ['selector', '[data-theme="dark"], [data-theme="oled"]'],
  theme: {
    // `text-base` is the font size. Left in the text colours, it would also set color to the page
    // background and make the text vanish; `text-inverse` is that colour instead.
    textColor: ({ theme }) => {
      const { base, ...colors } = theme('colors');
      return colors;
    },
    extend: {
      colors: {
        base: token('base'),
        // The page colour, for text on ink (fg) fills. `text-base` is already the font size.
        inverse: token('base'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        'surface-3': token('surface-3'),
        edge: token('edge'),
        fg: token('fg'),
        muted: token('muted'),
        faint: token('faint'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        shade: token('shade'),
        danger: token('danger'),
        success: token('success'),
        warning: token('warning'),
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'Geist', 'system-ui', 'sans-serif'],
        // Display only: titles at 24px and up. It has a single weight, so never bold it.
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"Geist Mono Variable"', '"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      zIndex: {
        nav: '30',
        player: '40',
        panel: '50',
        menu: '60',
        dialog: '70',
        toast: '80',
        overlay: '90',
      },
      boxShadow: {
        // Shadows carry the theme's hue (--c-shade) rather than plain black.
        float:
          '0 1px 0 0 rgb(var(--c-fg) / 0.04) inset, 0 18px 40px -18px rgb(var(--c-shade) / 0.55), 0 4px 12px -6px rgb(var(--c-shade) / 0.25)',
        cover: '0 22px 44px -24px rgb(var(--c-shade) / 0.7), 0 3px 10px -4px rgb(var(--c-shade) / 0.3)',
        lift: '0 8px 20px -8px rgb(var(--c-shade) / 0.5)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        equalizer: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
        pulse2: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(0.6)', opacity: '0.5' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        equalizer: 'equalizer 0.9s ease-in-out infinite',
        pulse2: 'pulse2 1.2s ease-in-out infinite',
        'fade-up': 'fade-up 240ms cubic-bezier(0.23, 1, 0.32, 1) both',
        'fade-in': 'fade-in 400ms ease-out both',
        pop: 'pop 320ms cubic-bezier(0.23, 1, 0.32, 1)',
        spin: 'spin 0.7s linear infinite',
      },
    },
  },
  plugins: [],
};
