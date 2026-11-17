/**
 * AURA Premium UI - Tailwind preset
 * Usage (tailwind.config.js):
 *   const aura = require("./aura-design-system/foundations/tailwind.preset.js");
 *   module.exports = { presets: [aura], content: ["./src/**\/*.{js,ts,jsx,tsx,html}"] };
 * Also import foundations/tokens.css once (it defines the CSS variables + dark mode).
 */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        display: ["Fraunces", "New York", "Playfair Display", "Georgia", "serif"],
        sans: ["Inter", "-apple-system", "SF Pro Text", "Roboto", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-xl": ["40px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg": ["32px", { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-md": ["26px", { lineHeight: "30px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "title-lg": ["22px", { lineHeight: "28px", fontWeight: "600" }],
        "title-md": ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "body-lg": ["17px", { lineHeight: "24px", fontWeight: "500" }],
        "body-md": ["15px", { lineHeight: "22px", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "18px", fontWeight: "500" }],
        "label-sm": ["13px", { lineHeight: "16px", fontWeight: "500" }],
        overline: ["12px", { lineHeight: "16px", letterSpacing: "0.06em", fontWeight: "600" }],
      },
      colors: {
        canvas: "var(--aura-canvas)",
        surface: { DEFAULT: "var(--aura-surface)", 2: "var(--aura-surface-2)" },
        ink: { 900: "var(--aura-ink-900)", 700: "var(--aura-ink-700)", 500: "var(--aura-ink-500)", 300: "var(--aura-ink-300)" },
        line: "var(--aura-line)",
        brand: { 900: "var(--aura-brand-900)", 700: "var(--aura-brand-700)", 600: "var(--aura-brand-600)", 400: "var(--aura-brand-400)", 100: "var(--aura-brand-100)" },
        cta: { 600: "var(--aura-cta-600)", 500: "var(--aura-cta-500)", 400: "var(--aura-cta-400)" },
        tile: { 700: "var(--aura-tile-700)", 500: "var(--aura-tile-500)", 300: "var(--aura-tile-300)", 100: "var(--aura-tile-100)" },
        success: "var(--aura-success)",
        warning: "var(--aura-warning)",
        danger: "var(--aura-danger)",
        info: "var(--aura-info)",
        mint: { DEFAULT: "var(--aura-mint)", ink: "var(--aura-mint-ink)" },
        lilac: { DEFAULT: "var(--aura-lilac)", ink: "var(--aura-lilac-ink)" },
        sky: "var(--aura-sky)",
        gold: "var(--aura-gold)",
        glass: { DEFAULT: "var(--aura-glass)", strong: "var(--aura-glass-strong)", border: "var(--aura-glass-border)" },
      },
      backgroundImage: {
        "gradient-header": "var(--aura-gradient-header)",
        "gradient-header-vignette": "var(--aura-gradient-header-vignette)",
        "gradient-cta": "var(--aura-gradient-cta)",
        "gradient-tile": "var(--aura-gradient-tile)",
        "gradient-tile-gloss": "var(--aura-gradient-tile-gloss)",
        "gradient-sky": "var(--aura-gradient-sky)",
        "gradient-aurora": "var(--aura-gradient-aurora)",
        "gradient-gold": "var(--aura-gradient-gold)",
        "gradient-festive": "var(--aura-gradient-festive)",
        "gradient-shimmer": "var(--aura-gradient-shimmer)",
      },
      borderRadius: { sm: "10px", md: "14px", lg: "16px", xl: "20px", "2xl": "22px", "3xl": "28px", pill: "999px" },
      spacing: { gutter: "20px", touch: "56px", 18: "72px", 22: "88px" },
      boxShadow: {
        sm: "var(--aura-shadow-sm)",
        md: "var(--aura-shadow-md)",
        lg: "var(--aura-shadow-lg)",
        tile: "var(--aura-shadow-tile), var(--aura-halo-tile)",
        cta: "var(--aura-shadow-cta), inset 0 1px 0 rgba(255,255,255,0.35)",
        glass: "var(--aura-shadow-lg), var(--aura-glass-highlight)",
        focus: "var(--aura-focus-ring)",
      },
      backdropBlur: { glass: "24px" },
      transitionDuration: { instant: "80ms", fast: "160ms", base: "260ms", slow: "420ms", cinematic: "700ms" },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
        spring: "var(--aura-ease-spring)",
        "spring-soft": "var(--aura-ease-spring-soft)",
      },
      keyframes: {
        "aura-rise": { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "none" } },
        "aura-shimmer": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(100%)" } },
        "aura-float": { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        "aura-pulse-halo": { "0%,100%": { boxShadow: "0 0 0 0 rgba(30,107,255,0.35)" }, "70%": { boxShadow: "0 0 0 14px rgba(30,107,255,0)" } },
      },
      animation: {
        rise: "aura-rise 420ms cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "aura-shimmer 1.4s cubic-bezier(0.65,0,0.35,1) infinite",
        float: "aura-float 4s ease-in-out infinite",
        "pulse-halo": "aura-pulse-halo 2.4s ease-out infinite",
      },
    },
  },
  plugins: [
    function ({ addComponents, addUtilities }) {
      addComponents({
        ".glass": {
          background: "var(--aura-glass)",
          border: "1px solid var(--aura-glass-border)",
          boxShadow: "var(--aura-shadow-lg), var(--aura-glass-highlight)",
          backdropFilter: "var(--aura-glass-blur)",
          "-webkit-backdrop-filter": "var(--aura-glass-blur)",
        },
        ".tile": {
          width: "64px", height: "64px", borderRadius: "22px", position: "relative",
          background: "var(--aura-gradient-tile)", color: "#fff",
          boxShadow: "var(--aura-shadow-tile), var(--aura-halo-tile)",
          display: "grid", placeItems: "center",
        },
        ".tile::before": {
          content: '""', position: "absolute", inset: "0", borderRadius: "inherit",
          background: "var(--aura-gradient-tile-gloss)", pointerEvents: "none",
        },
        ".press": { transition: "transform 160ms cubic-bezier(0.16,1,0.3,1)" },
        ".press:active": { transform: "scale(var(--aura-press-scale))" },
      });
      addUtilities({
        ".stagger-1": { animationDelay: "40ms" }, ".stagger-2": { animationDelay: "80ms" },
        ".stagger-3": { animationDelay: "120ms" }, ".stagger-4": { animationDelay: "160ms" },
        ".stagger-5": { animationDelay: "200ms" }, ".stagger-6": { animationDelay: "240ms" },
        ".stagger-7": { animationDelay: "280ms" }, ".stagger-8": { animationDelay: "320ms" },
      });
    },
  ],
};
