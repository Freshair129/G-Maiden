/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        podium: ['"FSP DEMO - PODIUM Sharp 4.11"', 'Impact', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        void: '#06070A',
        ice: '#8FD4FF',
        'ice-bright': '#9BE7FF',
        action: '#226CFF',
        signal: '#A3E635',
      },
    },
  },
  plugins: [],
}
