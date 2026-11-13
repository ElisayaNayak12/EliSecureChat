# AURA Foundations

All values below exist as tokens in `foundations/tokens.css` and `foundations/tokens.json`. Use the token name, never the raw value.

## 1. Colour

### Canvas and ink
| Token | Light | Dark | Use |
|---|---|---|---|
| `--aura-canvas` | `#F5F6FA` | `#0B0C10` | Page/screen background |
| `--aura-surface` | `#FFFFFF` | `#15171E` | Cards, sheets, inputs |
| `--aura-surface-2` | `#F0F2F7` | `#1C1F28` | Nested surfaces, chip bg |
| `--aura-ink-900` | `#0B1220` | `#F4F6FB` | Headlines |
| `--aura-ink-700` | `#2A3242` | `#C9CFDB` | Body |
| `--aura-ink-500` | `#6B7385` | `#8A91A3` | Labels, captions |
| `--aura-ink-300` | `#B9BFCC` | `#4A5062` | Placeholders, dividers |
| `--aura-line` | `rgba(11,18,32,0.08)` | `rgba(255,255,255,0.08)` | Hairlines |

### Brand (cinematic header)
`--aura-brand-900 #6E0A12` / `--aura-brand-700 #8F0E19` / `--aura-brand-600 #B3121F` / `--aura-brand-400 #D93A47` / `--aura-brand-100 #FDE8EA`

Header gradient: `--aura-gradient-header: linear-gradient(180deg, #B3121F 0%, #8F0E19 55%, #6E0A12 100%)`
Add a vignette overlay: `radial-gradient(120% 80% at 50% -20%, rgba(255,255,255,0.18), transparent 60%)`.

### CTA (warm accent)
`--aura-cta-600 #E85D12` / `--aura-cta-500 #F26A1B` / `--aura-cta-400 #F7931E`
Gradient: `--aura-gradient-cta: linear-gradient(180deg, #F7931E 0%, #F26A1B 100%)`

### Tile (glossy icon pucks)
`--aura-tile-700 #0A3FCC` / `--aura-tile-500 #1E6BFF` / `--aura-tile-300 #6FA3FF` / `--aura-tile-100 #E3EDFF`
Gloss: `--aura-gradient-tile: radial-gradient(120% 100% at 30% 15%, #6FA3FF 0%, #1E6BFF 45%, #0A3FCC 100%)`
Halo: `0 12px 32px -8px rgba(30,107,255,0.45)`

### Semantic
| Token | Value | Use |
|---|---|---|
| `--aura-success` | `#0E8A4E` | Benefit text ("Up to 25% Off"), success |
| `--aura-warning` | `#D97706` | Warnings |
| `--aura-danger` | `#DC2626` | Errors, destructive |
| `--aura-info` | `#1E6BFF` | Info, links |
| `--aura-mint` | `#D8F5E6` | "New" badge bg (mint) with `#0E8A4E` text |
| `--aura-lilac` | `#EBDDFB` | "New" badge bg (lilac) with `#6A1FB8` text |
| `--aura-sky` | `#E6F3FF` | Info banner bg (the "Free Cancellation" row) |

### Glass
Light: `--aura-glass: rgba(255,255,255,0.62)` border `rgba(255,255,255,0.75)`
Dark: `--aura-glass: rgba(21,23,30,0.58)` border `rgba(255,255,255,0.10)`
Always pair with `backdrop-filter: blur(24px) saturate(160%)` and an inner top highlight `inset 0 1px 0 rgba(255,255,255,0.55)`.

### Gradient library (decorative)
- `--aura-gradient-sky`: `linear-gradient(180deg,#CFE6FF 0%,#EAF4FF 60%,#F5F6FA 100%)` (search screen backdrop with soft clouds)
- `--aura-gradient-aurora`: `linear-gradient(135deg,#FF8A3D 0%,#FFB347 30%,#2F80ED 70%,#0A3FCC 100%)` (the "AI" orb)
- `--aura-gradient-gold`: `linear-gradient(135deg,#F9D976 0%,#F39F2C 100%)` (coins, rewards)
- `--aura-gradient-festive`: `linear-gradient(180deg,#B3121F 0%,#5C0810 100%)` + string-light dots (see components, Campaign banner)

## 2. Typography

| Role | Font | Fallback stack |
|---|---|---|
| Display (`--aura-font-display`) | **Fraunces** (web) / New York (iOS) / Playfair Display | `"Fraunces","New York","Playfair Display",Georgia,serif` |
| Sans (`--aura-font-sans`) | **Inter** (web) / SF Pro (iOS) / Roboto Flex (Android) | `"Inter",-apple-system,"SF Pro Text","Roboto",system-ui,sans-serif` |
| Mono | JetBrains Mono / SF Mono | for codes, PNR, OTP |

Type scale (mobile; multiply by 1.125 on >= 1024px):

| Token | Size / Line | Weight | Font | Use |
|---|---|---|---|---|
| `display-xl` | 40 / 44 | 700 | display | Hero numbers, onboarding |
| `display-lg` | 32 / 36 | 700 | display | Bento card title ("Flights") |
| `display-md` | 26 / 30 | 600 | display | Section hero ("Deals & Offers") |
| `title-lg` | 22 / 28 | 600 | sans | Screen title |
| `title-md` | 18 / 24 | 600 | sans | Card title, sheet title |
| `body-lg` | 17 / 24 | 500 | sans | Primary values ("Bhubaneswar", "Thu, 24 Dec") |
| `body-md` | 15 / 22 | 400 | sans | Body |
| `label-md` | 14 / 18 | 500 | sans | Field labels ("Departure Date") |
| `label-sm` | 13 / 16 | 500 | sans | Tile labels, captions |
| `overline` | 12 / 16 | 600, +0.06em caps | sans | Airport codes ("BBI"), badges |

Rules: display letter-spacing -0.02em; body never justified; numbers use `font-variant-numeric: tabular-nums`.
Benefit line pattern: "Up to **25% Off**" - prefix in ink-700 regular, value in `--aura-success` semibold.

## 3. Spacing (4pt grid)
`--aura-space-1 4` / `2 8` / `3 12` / `4 16` / `5 20` / `6 24` / `8 32` / `10 40` / `12 48` / `16 64`

Screen gutter 20 / card padding 20 / bento gap 16 / section gap 24 / tile row gap 12 / tab bar bottom offset 16.

## 4. Radius
`--aura-r-sm 10` (badges) / `--aura-r-md 14` (chips) / `--aura-r-lg 16` (inputs) / `--aura-r-xl 20` (buttons) / `--aura-r-2xl 22` (tiles) / `--aura-r-3xl 28` (cards, sheets) / `--aura-r-pill 999`.
The main white content panel that sits under the header uses 28px top corners only.

## 5. Elevation (tinted, soft)
| Token | Value | Use |
|---|---|---|
| `--aura-shadow-sm` | `0 2px 8px -2px rgba(11,18,32,0.08)` | chips, inputs |
| `--aura-shadow-md` | `0 10px 30px -12px rgba(11,18,32,0.14)` | cards |
| `--aura-shadow-lg` | `0 24px 60px -20px rgba(11,18,32,0.22)` | sheets, floating tab bar |
| `--aura-shadow-tile` | `0 12px 32px -8px rgba(30,107,255,0.45)` | glossy tiles (hue-matched) |
| `--aura-shadow-cta` | `0 14px 32px -10px rgba(242,106,27,0.55)` | primary CTA |

Dark mode: replace the ink tint with `rgba(0,0,0,0.6)`; keep hue-tinted tile/CTA shadows.

## 6. Iconography and imagery
- Stroke icons 24px, 1.75px stroke, rounded caps (Lucide / Material Symbols Rounded / SF Symbols).
- Glossy tile = 64px circle or rounded-square (22px), gradient `--aura-gradient-tile`, white icon, top-left radial gloss `rgba(255,255,255,0.45)` to transparent, outer halo ring (`--aura-tile-100` at 50%, 8px larger) and `--aura-shadow-tile`.
- Bento imagery: 3D product renders (plane, train, hotel, car) with transparent bg, positioned bottom-right, 15-25% bleeding outside the card (`overflow: hidden` on card). Add a subtle ground shadow under the render.
- Campaign banner imagery: dark red gradient, string lights (small 2px blur-glow dots along curves), gold serif wordmark.
- Avatars 40px circle with 2px surface ring.
- Where real 3D renders are unavailable, use large emoji or Lottie/Rive assets at 96-128px with a soft ground shadow; never a flat clip-art.
