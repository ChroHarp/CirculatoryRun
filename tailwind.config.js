/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        pulseFast: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.08)', opacity: '0.85' },
        },
        speedLine: {
          '0%': { opacity: '0.2', transform: 'scale(0.98)' },
          '50%': { opacity: '0.6', transform: 'scale(1.02)' },
          '100%': { opacity: '0.2', transform: 'scale(0.98)' },
        }
      },
      animation: {
        'pulse-fast': 'pulseFast 0.6s infinite ease-in-out',
        'speed-line': 'speedLine 0.25s infinite linear',
      }
    },
  },
  plugins: [],
}
