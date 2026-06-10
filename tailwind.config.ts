import type { Config } from "tailwindcss";

// Palette ported from the original style.css :root variables.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#fffbf7",
        ink: "#1a1a1a",
        muted: "#64748b",
        card: "#ffffff",
        line: "#f0e6db",
        coral: "#ff6b6b",
        amber: "#f59e0b",
        teal: "#14b8a6",
        indigo: "#6366f1",
        pink: "#ec4899",
        sky: "#0ea5e9",
      },
      borderRadius: {
        card: "12px",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 2px 8px rgba(0, 0, 0, 0.04)",
        "card-hover": "0 8px 24px rgba(0, 0, 0, 0.08)",
      },
      maxWidth: {
        content: "960px",
      },
    },
  },
  plugins: [],
};

export default config;
