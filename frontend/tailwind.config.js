/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0a0b0f', secondary: '#111318', card: '#161a24', border: '#1e2235' },
        accent: { DEFAULT: '#6366f1', hover: '#4f46e5', glow: '#6366f133' },
        profit: { DEFAULT: '#22c55e', dim: '#16a34a', glow: '#22c55e22' },
        loss: { DEFAULT: '#ef4444', dim: '#dc2626', glow: '#ef444422' },
        gold: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
