import type { Config } from "tailwindcss";

/**
 * Theme colors are RGB-triplet CSS variables (see app/assets/css/main.css),
 * so every token supports Tailwind opacity modifiers (bg-accent/10, ...)
 * and switches automatically with prefers-color-scheme.
 */
const themeColors = {
  bg: "rgb(var(--bg) / <alpha-value>)",
  surface: "rgb(var(--surface) / <alpha-value>)",
  "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
  "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
  border: "rgb(var(--border) / <alpha-value>)",
  "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
  text: "rgb(var(--text) / <alpha-value>)",
  muted: "rgb(var(--muted) / <alpha-value>)",
  faint: "rgb(var(--faint) / <alpha-value>)",
  accent: "rgb(var(--accent) / <alpha-value>)",
  "accent-strong": "rgb(var(--accent-strong) / <alpha-value>)",
  "accent-dim": "rgb(var(--accent-dim) / <alpha-value>)",
  "accent-text": "rgb(var(--accent-text) / <alpha-value>)",
  "accent-border": "rgb(var(--accent-border) / <alpha-value>)",
  ok: "rgb(var(--ok) / <alpha-value>)",
  "ok-dim": "rgb(var(--ok-dim) / <alpha-value>)",
  warn: "rgb(var(--warn) / <alpha-value>)",
  "warn-dim": "rgb(var(--warn-dim) / <alpha-value>)",
  bad: "rgb(var(--bad) / <alpha-value>)",
  "bad-dim": "rgb(var(--bad-dim) / <alpha-value>)",
  info: "rgb(var(--info) / <alpha-value>)",
  "info-dim": "rgb(var(--info-dim) / <alpha-value>)",
  "body-text": "rgb(var(--body-text) / <alpha-value>)",
  "code-bg": "rgb(var(--code-bg) / <alpha-value>)",
};

export default <Partial<Config>>{
  content: [],
  theme: {
    extend: {
      colors: themeColors,
      fontFamily: {
        ui: "var(--font-ui)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
      },
      boxShadow: {
        card: "var(--shadow)",
        "card-hover": "0 8px 24px -12px rgba(15, 23, 42, 0.25)",
        "accent-lg": "0 12px 28px -10px var(--accent)",
        drawer: "-16px 0 48px rgba(15, 23, 42, 0.12)",
        modal: "0 12px 40px rgba(15, 23, 42, 0.25)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        rise: "rise 0.35s cubic-bezier(0.2, 0.7, 0.2, 1) both",
      },
    },
  },
};
