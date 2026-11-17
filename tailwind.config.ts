import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1220',
        panel: '#131c2e',
        line: '#24314a',
        accent: '#f97316',
      },
    },
  },
  plugins: [],
} satisfies Config;
