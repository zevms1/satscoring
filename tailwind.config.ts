import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1155cc",
          dark: "#0d3f99",
          light: "#e8eefc",
        },
        // Same accuracy/status palette the score report uses, so app UI
        // (pills, danger buttons) matches it. Mirrors the ACT app.
        good: { DEFAULT: "#3f7a4e", soft: "#e3efe4" },
        mid: { DEFAULT: "#b8860b", soft: "#f7edd6" },
        weak: { DEFAULT: "#c0392b", soft: "#f8e2df" },
        accent: { DEFAULT: "#1155cc", soft: "#dbe6f9" },
      },
    },
  },
  plugins: [],
};

export default config;
