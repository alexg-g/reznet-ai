import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cyberpunk color palette
        'neon-cyan': '#00F6FF',
        'hot-magenta': '#FF00F7',
        'electric-purple': '#9D00FF',
        'deep-dark': '#0D0221',
        'dark-bg': '#0D0D1A',
        'lime-green': '#00FF00',
        'orange-neon': '#FF8C00',
        'primary': '#0da6f2',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        'lg': '0.25rem',
        'xl': '0.5rem',
        'full': '0.75rem',
      },
      boxShadow: {
        'glow-cyan': '0 0 5px #00F6FF, 0 0 10px #00F6FF, 0 0 15px #00F6FF',
        'glow-magenta': '0 0 5px #FF00F7, 0 0 10px #FF00F7, 0 0 15px #FF00F7',
        'glow-purple': '0 0 5px #9D00FF, 0 0 10px #9D00FF, 0 0 15px #9D00FF',
        'glow-primary': '0 0 5px #0da6f2, 0 0 10px #0da6f2, 0 0 15px #0da6f2',
        'glow-lime': '0 0 5px #00FF00, 0 0 10px #00FF00, 0 0 15px #00FF00',
        'glow-orange': '0 0 5px #FF8C00, 0 0 10px #FF8C00, 0 0 15px #FF8C00',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        }
      }
    },
  },
  plugins: [],
}
export default config
