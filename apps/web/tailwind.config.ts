import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          950: "#0b0d11",
          900: "#12151c",
          800: "#1a1f29",
          700: "#252b38",
          600: "#3a4254",
        },
        mist: {
          100: "#e8eaed",
          400: "#8b93a7",
          500: "#6b7388",
        },
        ember: "#e8a54b",
        moss: "#5dbe8a",
        rose: "#e06c75",
        lake: "#6cb6ff",
      },
    },
  },
  plugins: [],
} satisfies Config;
