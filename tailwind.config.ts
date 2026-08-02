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
      },
    },
  },
  plugins: [],
};

export default config;
