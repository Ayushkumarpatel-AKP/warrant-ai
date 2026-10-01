import type { Config } from "tailwindcss";

/**
 * Warrant's Tailwind layer mirrors the CSS custom properties in
 * app/globals.css + app/premium.css. Use these tokens in new markup instead
 * of hardcoding a brand hex, so the cream/navy split stays consistent.
 *
 *   Cream surface (marketing, legal): cream · sand · flame · soot
 *   Navy surface  (app, receipts):    midnight · cobalt · periwinkle · glacia
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF3E1",
        sand: "#F5E7C6",
        flame: { DEFAULT: "#FA8112", deep: "#C25A00", soft: "#FFA13D" },
        soot: "#222222",
        midnight: "#091540",
        cobalt: "#1B2CC1",
        periwinkle: "#7692FF",
        glacia: "#ABD2FA",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        brand: "16px",
        "brand-lg": "26px",
      },
      keyframes: {
        alarm: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "brand-rise": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "brand-drift": {
          to: { transform: "translate(70px, 46px) scale(1.16)" },
        },
        "brand-sweep": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        alarm: "alarm 1s ease-in-out infinite",
        "brand-rise": "brand-rise .4s ease both",
        "brand-drift": "brand-drift 14s ease-in-out infinite alternate",
        "brand-sweep": "brand-sweep 6s linear infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
