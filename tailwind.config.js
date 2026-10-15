/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./entrypoints/**/*.{html,ts,tsx}",
    "./src/**/*.{html,ts,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        orbit: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          900: '#14532d',
          dark: '#0d1117',
          panel: '#161b22',
          border: '#30363d',
          accent: '#58a6ff',
          neon: '#39d353'
        }
      }
    },
  },
  plugins: [],
}
