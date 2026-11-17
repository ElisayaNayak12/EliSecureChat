# AURA Premium UI Design System

A downloadable, reusable design + motion system for building premium, glossy, cinematic apps and websites
(iOS, Android, web). Inspired by top-tier consumer apps: bento cards, serif display type, glass surfaces,
3D glossy icon tiles, floating pill navigation and Keka-style spring animations.

## Quick start

**With an AI builder (Claude Code, Antigravity, Cursor, Windsurf, Lovable, Bolt, v0):**
1. Copy the whole `aura-design-system/` folder into your project root (or attach it to the chat).
2. Paste prompt A from `prompts.md`, fill in your stack and the app you want.
3. Ask the builder to run the Quality Gate in `SKILL.md` before it finishes.

**Claude Code as a skill:** copy the folder to `~/.claude/skills/aura-premium-ui/` (or `.claude/skills/` inside a project). Claude will load it automatically whenever UI work matches the description, or you can type `/aura-premium-ui`.

**By hand (web):** link `foundations/tokens.css`, add `class="aura"` to `<body>`, use the utility classes. See `preview/index.html` for a complete working screen.

## What is inside
| File | Purpose |
|---|---|
| `SKILL.md` | The rules. Design DNA, brand presets, non-negotiables, Quality Gate |
| `foundations.md` | Colour, type, spacing, radius, elevation, glass, gradients, icons |
| `foundations/tokens.css` | CSS variables + light/dark + reduced motion + utility classes |
| `foundations/tokens.json` | Tokens for RN / Flutter / Figma Tokens Studio / Style Dictionary |
| `foundations/tailwind.preset.js` | Tailwind preset |
| `components.md` | 20 component specs |
| `motion.md` | Full animation system, choreography, per-component motion, haptics, snippets |
| `screens.md` | 11 screen layout patterns incl. web landing page and HR dashboard |
| `platforms.md` | Setup + code for Web, React/Next, React Native, Flutter, SwiftUI, Compose |
| `prompts.md` | Ready-to-paste prompts |
| `preview/index.html` | Live animated demo (open in any browser; toggle dark mode) |
| `preview/splash.html` | Post-login brand splash animation demo (logo draw-in, sparks, loop, exit into app) |

## Re-branding in 30 seconds
Edit 4 variables at the top of `foundations/tokens.css`: `--aura-brand-900`, `--aura-brand-600`, `--aura-cta-500`, `--aura-tile-500`. Presets are listed in `SKILL.md` section 2.

## Licence
Free to use in your own projects. Fonts (Fraunces, Inter) are OFL. Icons (Lucide) are ISC.
