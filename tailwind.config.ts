import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        volt: {
          DEFAULT: '#B4F000',
          hover: '#C6FF1A',
          dark: '#94C900',
        },
      },
      boxShadow: {
        volt: '0 0 0 1px rgba(180, 240, 0, 0.6), 0 0 22px -4px rgba(180, 240, 0, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
