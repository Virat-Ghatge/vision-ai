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
        // Marvel's Vision (Synthezoid Crimson + Android Teal + Mind Stone Solar Gold)
        vision: {
          bg: '#09060e',
          panel: '#120b1c',
          card: '#1a1027',
          border: '#2e1d42',
          crimson: '#e11d48',
          crimsonLight: '#fb7185',
          gold: '#fbbf24',
          goldBright: '#fde047',
          teal: '#14b8a6',
          tealBright: '#2dd4bf',
          cape: '#fef08a'
        },
        // Legacy aliases preserved for compatibility
        orbit: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
          900: '#134e4a',
          dark: '#09060e',
          panel: '#120b1c',
          border: '#2e1d42',
          accent: '#fbbf24',
          neon: '#2dd4bf'
        }
      }
    },
  },
  plugins: [],
}

