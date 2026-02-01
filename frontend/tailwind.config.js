/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#0f6df0",
        "background-light": "#f5f7f8",
        "background-dark": "#101822",
      },
      fontFamily: {
        "display": ["Inter", "sans-serif"],
        "mono": ["JetBrains Mono", "monospace"]
      },
    },
  },
  plugins: [],
}
