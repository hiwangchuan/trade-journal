import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        buy: "rgb(var(--buy) / <alpha-value>)",
        sell: "rgb(var(--sell) / <alpha-value>)",
      },
      boxShadow: { panel: "0 16px 40px rgba(0,0,0,.18)" },
    },
  },
  plugins: [],
} satisfies Config;
