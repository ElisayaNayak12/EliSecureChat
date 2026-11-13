# Copy-paste prompts for AI builders

Attach or paste the `aura-design-system` folder (at minimum `SKILL.md`, `foundations/tokens.css`, `components.md`, `motion.md`) and then use one of these prompts.

## A. Universal "use this design system" prompt (Claude Code / Antigravity / Cursor / Windsurf / Copilot)
```
You are building UI for me. Load and follow the AURA Premium UI design system in ./aura-design-system/ exactly:
1. Read SKILL.md first, then foundations/tokens.css, components.md, motion.md, screens.md and the matching section of platforms.md for my stack.
2. Use ONLY the tokens (CSS variables / tokens.json). Never invent colours, radii, shadows, fonts or timings.
3. Every screen: cinematic gradient header + white 28px-radius content panel, bento cards with serif display headlines and 3D/illustration bleed, glossy icon tiles with gloss + halo, one orange gradient CTA, floating glass pill tab bar.
4. Every element gets the 4 motion states (enter/stagger, hover/press, loading skeleton, exit) with springs and expo-out as defined in motion.md. Shared-element transitions between list and detail.
5. Dark mode + reduced motion + 56px touch targets + 4.5:1 contrast are mandatory.
6. Before you finish, run the Quality Gate in SKILL.md and list each check as pass/fail.
Stack: <React + Tailwind + Framer Motion | Next.js | React Native Expo | Flutter | SwiftUI | Jetpack Compose | plain HTML/CSS>
Brand preset: <Crimson Fest | Midnight | Emerald | Graphite | Aurora> (see SKILL.md section 2)
Build: <describe the app / screen>
```

## B. Antigravity / Lovable / Bolt / v0 (single-shot web app)
```
Build a <app type> web app. Use the attached AURA design system (SKILL.md + tokens.css + components.md + motion.md) as the single source of truth for all styling and animation. Tailwind preset is in foundations/tailwind.preset.js - use it. Use Framer Motion for springs, layoutId for the segmented control and tab bar, and View Transitions for routes. Fonts: Fraunces (display) + Inter (sans) from Google Fonts. Icons: lucide-react. Start with the Home screen pattern from screens.md section A, then <list other screens>. Include light and dark mode toggle. Do not use Material UI, Bootstrap, shadcn defaults or 8px corners anywhere.
```

## C. Mobile app (Expo / Flutter) prompt
```
Create a <platform> mobile app following the AURA design system in the attached folder. Implement AuraTheme from platforms.md section <3 Flutter | 4 React Native | 5 SwiftUI | 6 Compose>. Screens: Home (screens.md A), Search form (B), Results (C), Detail (D), Profile (G), Auth (H). Every screen entrance must follow the choreography timeline in motion.md section 4; use springs for sheets, tabs, toggles; add haptics per motion.md section 6; respect reduced motion. Use 3D-style hero assets (placeholder emoji at 96px with ground shadow until real renders are supplied).
```

## D. Redesign an existing app
```
Redesign the existing screens in this repo to the AURA design system (./aura-design-system). Keep all logic, routes and data. Replace: colours -> tokens; corners -> 28/22/20/16; flat icons -> glossy tiles; top app bar -> cinematic gradient header with glass controls; bottom nav -> floating glass pill; lists of actions -> bento grid; spinners -> shimmer skeletons; instant state changes -> spring animations. Produce a before/after checklist per screen and run the Quality Gate.
```

## E. Marketing website
```
Build a marketing landing page with the AURA design system using screens.md section K (hero band, bento feature grid, social proof, pricing with highlighted middle card, FAQ accordion, dark footer). Scroll-reveal every section once (rise), parallax the hero device at 0.3x, count up stats on view, glass sticky nav. Mobile-first, max width 1200, Lighthouse performance >= 90 (animate transform/opacity only, lazy-load images).
```

## F. One-line reminder for follow-up turns
```
Keep following ./aura-design-system/SKILL.md - tokens only, bento + glossy tiles + glass, springs and staggered entrances, run the Quality Gate.
```
