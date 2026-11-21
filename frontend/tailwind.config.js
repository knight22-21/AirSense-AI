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
        gov: {
          navy:      '#0b3d6b',
          navyDeep:  '#082b4d',
          saffron:   '#e08a00',
          green:     '#137a3a',
          ink:       '#1f2937',
          muted:     '#5b6b7f',
          line:      '#d8e0ea',
          mist:      '#f3f6fa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
}
