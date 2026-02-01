/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{html,tsx,ts}',
  ],
  theme: {
    extend: {
      colors: {
        dora: {
          blue: '#0099FF',
          'blue-dark': '#0077CC',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'bounce-small': 'bounce-small 0.5s ease-in-out',
        'thinking': 'thinking 1.4s ease-in-out infinite',
        'pulse-slow': 'pulse 2s ease-in-out infinite',
        'indeterminate': 'indeterminate 1.5s ease-in-out infinite',
      },
      keyframes: {
        'bounce-small': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.3)' },
        },
        'thinking': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%': { transform: 'translateY(-8px)', opacity: '1' },
        },
        'indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
    },
  },
  plugins: [],
};
