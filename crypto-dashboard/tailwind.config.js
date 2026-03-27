export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {'border-glow': {
      '0%, 100%': { 'border-color': 'rgba(59, 130, 246, 0.1)' },
      '50%': { 'border-color': 'rgba(59, 130, 246, 0.6)', 'box-shadow': '0 0 15px rgba(59, 130, 246, 0.2)' },
    },
  },
  animation: {
    'ai-glow': 'border-glow 3s infinite ease-in-out',},
  },
  plugins: [],
}
