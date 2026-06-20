/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'ice-dark': '#08090c',
        'ice-panel': 'rgba(18, 20, 28, 0.72)',
      },
      backdropBlur: {
        'glass': '12px',
      },
      opacity: {
        'glass': '0.72',
      },
    },
  },
  plugins: [],
}
