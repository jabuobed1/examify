/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: '#14b8a6',
        warning: '#f59e0b',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(59, 130, 246, 0.18), 0 20px 45px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
};
