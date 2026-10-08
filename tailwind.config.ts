import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix: string, shades: number[]) =>
  Object.fromEntries(shades.map((s) => [s, v(`${prefix}-${s}`)]));

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: scale("slate", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        blue: scale("blue", [200, 300, 400]),
        emerald: scale("emerald", [200, 300, 400]),
        red: scale("red", [200, 300, 400]),
        amber: scale("amber", [200, 300, 400]),
        indigo: scale("indigo", [200, 300, 400]),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
