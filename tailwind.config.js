/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070d1a',
          900: '#0b1220',
          850: '#0f172a',
          800: '#152036',
          700: '#1e2d4a',
          600: '#2a3e63',
        },
        cyanbrand: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 24px -4px rgba(2, 6, 23, 0.45)',
        glow: '0 0 0 1px rgba(34, 211, 238, 0.25), 0 8px 28px -8px rgba(6, 182, 212, 0.25)',
      },
    },
  },
  plugins: [],
};
