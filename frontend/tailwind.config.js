/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        aqi: {
          good:      '#00e400',
          moderate:  '#ffff00',
          sensitive: '#ff7e00',
          unhealthy: '#ff0000',
          very:      '#8f3f97',
          hazardous: '#7e0023',
        },
        surface: {
          DEFAULT: '#1e293b',
          2: '#0f172a',
          3: '#334155',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
