---
name: aura-premium-ui
description: Premium, glossy, cinematic UI design system (Apple-grade polish + Keka-style fluid motion) for mobile apps (iOS/Android), web apps and websites. Use whenever building or redesigning ANY screen, component, page or app so the output looks like a top-tier consumer product - bento cards, glass surfaces, serif display headlines, 3D glossy icon tiles, floating pill tab bar, spring animations. Load this before writing any UI code.
version: 1.0.0
author: In2IT EBS App Dev
---

# AURA - Premium UI Design System

AURA is a complete visual + motion language. It is **platform-agnostic**: the same tokens and rules apply to
Web (HTML/CSS/React/Next/Vue), React Native, Flutter, SwiftUI and Jetpack Compose.

Reference look: a modern Indian travel super-app home screen - deep crimson cinematic header, white bento
cards with serif headlines and 3D product renders, glossy blue icon tiles, a floating pill tab bar, and a
"Grand Fest" campaign banner with string lights. AURA generalises that look so it works for **any domain**
(HR, fintech, e-commerce, SaaS dashboards, healthcare, travel).

## How to use this skill (for AI builders and humans)

1. Read this file fully. Then read `foundations/tokens.css` (or `tokens.json`) and `motion.md`.
2. Copy `foundations/tokens.css` into the project (or the Tailwind preset / platform snippet from `platforms.md`).
3. Build every screen using ONLY the tokens - never invent ad-hoc colours, radii, shadows or timings.
4. Every interactive element MUST have the 4 motion states in `motion.md` (enter, hover/press, loading, exit).
5. Before finishing, run the **Quality Gate** checklist at the bottom of this file.

Files in this package:

| File | What it contains |
|---|---|
| `SKILL.md` | This file - principles, rules, quality gate |
| `foundations/tokens.css` | CSS custom properties, light + dark, ready to paste |
| `foundations/tokens.json` | Same tokens as JSON (Style Dictionary / Figma Tokens / RN / Flutter) |
| `foundations/tailwind.preset.js` | Tailwind preset exposing all tokens |
| `foundations.md` | Colour, typography, spacing, radius, elevation, glass, gradients, iconography |
| `components.md` | Spec for every component (anatomy, states, sizes, code) |
| `motion.md` | Animation system - curves, durations, choreography, per-component motion |
| `screens.md` | Screen-level layout patterns (home, search, list, detail, onboarding, dashboard) |
| `platforms.md` | Implementation mapping + snippets for Web, React Native, Flutter, SwiftUI, Compose |
| `prompts.md` | Copy-paste prompts for Claude / Antigravity / Cursor / Lovable / Bolt |
| `preview/index.html` | Live animated reference implementation (open in browser) |
| `preview/splash.html` | Live brand-splash animation (comet wordmark reveal + mark variant, loop, exit into the app) |
| `reference/keka-splash-frames.jpg` | Frame sheet of the reference post-login animation (motion reference only, never copy the logo) |

---

## 1. Design DNA (the 8 rules)

1. **Cinematic header, calm body.** One saturated, dark-to-darker gradient band at the top (brand hue). Everything below sits on a near-white canvas (`--aura-canvas`). The contrast between them creates the "premium" feeling. Never put saturated colour across the whole screen.
2. **Bento, not lists.** Primary actions live in a bento grid of white cards with 28px radius, large serif headline, a one-line benefit in brand-green, and a 3D render / illustration bleeding off the bottom-right edge. Secondary actions live in a horizontal row of glossy icon tiles.
3. **Serif for emotion, sans for information.** Display headlines use the serif display face (`--aura-font-display`). Everything else (labels, body, numbers, buttons) uses the sans face (`--aura-font-sans`). This pairing is what separates AURA from generic Material/Bootstrap.
4. **Glass over gradients.** Any surface that floats above imagery (tab bar, header pills, sheets, toasts) is frosted glass: `backdrop-filter: blur(24px) saturate(160%)` + a 1px inner highlight. Never solid grey.
5. **Soft, layered light.** Shadows are large, soft and tinted (never pure black). Icon tiles have a radial gloss highlight at top-left plus an outer "halo" glow of the same hue at 15% opacity. Think physical glass pucks lit from above.
6. **One accent CTA per screen.** The primary button is a full-width, 20px-radius, warm orange gradient (`--aura-gradient-cta`) with white 18px semibold text and a trailing arrow. Only one of these per viewport.
7. **Motion is the brand.** Everything enters with a short staggered rise (opacity 0 to 1, translateY 16 to 0, 420ms, expo-out). Press = scale 0.97. Sheets and tabs use springs. Numbers count up. Images parallax. Nothing snaps. See `motion.md`.
8. **Density: generous.** 20px screen gutters, 16px between cards, 24px between sections, 56px min touch target. Whitespace is a feature.
9. **A signature launch moment.** After login and on cold start, show the brand splash (`motion.md` section 8, `components.md` section 20, demo `preview/splash.html`). Default is the comet wordmark reveal: the first letter pops in, three spark "comets" orbit the word on curved trails while the other letters reveal left-to-right, the comets land as the brand sparks, the wordmark holds with a twinkle while data loads, then the app rises in underneath. Apps with a symbol instead of a wordmark use the mark + sparks variant. Never a bare spinner on a blank page.

## 2. Brand hue is swappable

AURA ships with the reference palette (crimson header, orange CTA, electric-blue icon tiles, emerald benefit text).
To re-brand, change ONLY these 4 tokens in `tokens.css`: `--aura-brand-900`, `--aura-brand-600`, `--aura-cta-500`, `--aura-tile-500`.
Everything else (canvas, ink, glass, shadows, motion) stays the same - that preserves the premium feel.

Suggested presets:

| Preset | brand-900 | brand-600 | cta-500 | tile-500 |
|---|---|---|---|---|
| Crimson Fest (default) | `#6E0A12` | `#B3121F` | `#F26A1B` | `#1E6BFF` |
| Midnight (HR / SaaS, Keka-like) | `#0B1C3D` | `#1B3A8A` | `#6C5CE7` | `#2F80ED` |
| Emerald (fintech / health) | `#063D2E` | `#0E8A4E` | `#F5A524` | `#1E6BFF` |
| Graphite (luxury / fashion) | `#111214` | `#2A2C31` | `#D4A853` | `#4A4F5C` |
| Aurora (consumer / social) | `#2B0A5C` | `#6A1FB8` | `#FF4D8D` | `#1E9BFF` |

## 3. Non-negotiables

- Radius: cards 28px, tiles 22px, buttons 20px, chips 14px, inputs 16px. Never 4px/8px "material" corners.
- Minimum body text 15px, labels 13px, never below 12px.
- Headlines: serif display, weight 600-700, letter-spacing -0.02em, line-height 1.05.
- Icons: 24px stroke icons (Lucide / SF Symbols / Material Symbols Rounded) inside glossy tiles - never flat icons sitting on the page.
- Dark mode is mandatory and is NOT an inversion: canvas `#0B0C10`, cards `#15171E`, glass darkens, gloss highlights stay.
- Respect `prefers-reduced-motion`: swap springs/translations for 150ms opacity fades.
- Accessibility: contrast >= 4.5:1 for text, focus ring 3px `--aura-tile-500` at 40% outside the element, every tile has a visible label.

## 4. Quality Gate (run before you say "done")

- [ ] Header is a brand gradient; body is canvas white (or dark canvas). No full-screen saturated colour.
- [ ] Primary actions are bento cards with serif headline + benefit line + bleed image.
- [ ] Secondary actions are glossy icon tiles with gloss highlight + halo glow + label.
- [ ] Exactly one orange-gradient CTA visible.
- [ ] Tab bar is a floating glass pill with a soft-filled active state, not a flat bar.
- [ ] Every screen entrance is staggered (40ms per item) with expo-out; press scales to 0.97.
- [ ] Sheets, toggles and tab changes use spring physics.
- [ ] Loading uses shimmer skeletons shaped like the final content, never spinners alone.
- [ ] Post-login / cold start shows the brand splash (draw-in, sparks, breathing loop, exit into app entrance), minimum 2.4s, with reduced-motion fallback.
- [ ] Dark mode checked. Reduced motion checked. Touch targets >= 56px.
- [ ] Only tokens used - grep for raw hex / px shadows / cubic-bezier outside tokens and remove them.
