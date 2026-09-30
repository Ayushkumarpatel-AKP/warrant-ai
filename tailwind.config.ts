import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        alarm: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        alarm: "alarm 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
