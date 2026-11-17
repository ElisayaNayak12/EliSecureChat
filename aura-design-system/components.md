# AURA Components

Each component lists: anatomy, sizes, states, tokens, and a minimal web snippet (classes come from `foundations/tokens.css`).
Motion for every component is defined in `motion.md`. Platform equivalents are in `platforms.md`.

## 1. App header (cinematic)
**Anatomy:** full-width band, `gradient-header` + `gradient-header-vignette`, height 160-200 (mobile) with safe-area; left = 48px glass circle (menu / back); centre = glass promo pill (icon badge + 2-line text + chevron); right = 48px glass circle (coins / avatar / notifications).
**Variant - Sky:** for search/form screens use `gradient-sky` with 2-3 soft white blurred ellipses ("clouds", `filter: blur(30px)`, opacity 0.7) instead of the brand gradient. Controls remain glass circles.
**Below the header:** the content panel is `surface`, `r-3xl` top corners, overlaps the header by 24px.
```html
<header class="aura-header">
  <button class="aura-glass aura-circle aura-press" aria-label="Menu">☰</button>
  <a class="aura-glass aura-promo-pill aura-press"><img class="badge"/><span><b>Flat 15% Off</b><br/>on Flights</span><i>›</i></a>
  <button class="aura-glass aura-circle aura-press" aria-label="Rewards">🪙</button>
</header>
```
Glass circle: 48x48, `r-pill`, `glass`, border 1px `glass-border`, icon 22px white (on brand) or ink-900 (on sky).
Promo pill: height 56, `r-pill`, padding 8 16 8 8, text `label-md` 600 + `label-sm`, chevron ink-300.

## 2. Bento card (primary action)
**Anatomy:** `aura-card` (surface, r-3xl, shadow-md, padding 20, overflow hidden) > title (`display-lg` serif, ink-900) > benefit line (`body-lg`: "Up to " ink-700 + "25% Off" success 600) > image (absolute, bottom -12%, right -10%, width 70% of card, drop-shadow `0 16px 24px rgba(11,18,32,0.18)`).
**Sizes:** Tall (2 rows, 1 col) 270px; Wide (1 row) 150px; Square 150px. Grid: 2 columns, 16px gap; tall card left, two wide cards right (as in reference), then mirror on the next row.
**Optional badge:** "New" chip top-right of title row: `mint` bg, `mint-ink` text, `overline` (not uppercase here, 13px 600), padding 4 10, `r-sm`.
**States:** default / hover (lift) / pressed (scale .97) / loading (skeleton: title bar 60%x28, line 40%x18, image blob) / disabled (opacity .5, no image shadow).
```html
<article class="aura-card aura-press bento bento-tall">
  <h2 class="aura-display-lg">Flights</h2>
  <p class="aura-body-lg">Up to <b class="benefit">25% Off</b></p>
  <img class="bento-img" src="plane.png" alt=""/>
</article>
```

## 3. Feature card (horizontal, secondary)
Surface card, r-3xl, padding 16, height 120, left = 64px glossy tile (variant: light-blue disc with glossy icon and small dark "PRO" tag overlapping bottom-left), right = title `title-md` 2 lines ("Flight\nTracker"). Two per row.

## 4. Glossy icon tile row (quick actions)
**Anatomy:** horizontal scroll row, 5 visible (last one peeking 40% to signal scroll), gap 12, gutter 20. Each item = `aura-tile` (64, r-2xl or circle, `gradient-tile`, gloss pseudo, `shadow-tile` + `halo-tile`) + label `label-sm` ink-700, 2 lines centre, max 72px wide.
**Badge:** "New" above the tile, offset -8px, `lilac` bg / `lilac-ink` text, `overline` 12px 600, padding 3 10, r-sm, `shadow-sm`.
**Variants:** `tile--light` (tile-100 bg, tile-500 icon: for less important actions), `tile--gold` (gradient-gold: rewards), `tile--brand` (gradient-header: campaign).
```html
<a class="quick aura-press">
  <span class="aura-tile"><svg class="icon"/></span>
  <span class="aura-label-sm">Credit<br/>Card</span>
</a>
```

## 5. Primary CTA
`aura-btn-primary`: full width, 56-60px, r-xl, `gradient-cta`, text 18/600 white, trailing arrow 22px, `shadow-cta` + inner top highlight. Only one per viewport.
**Secondary:** surface bg, 1px line, ink-900 text. **Tertiary:** text-only `cta-600`. **Destructive:** `danger` bg. **Icon button:** 48 circle glass.
**Sizes:** lg 56 / md 48 / sm 40 (sm only inside cards and sheets).

## 6. Segmented control
Track: surface-2 (on sky: glass-strong), r-pill, height 56, padding 4. Selected segment: ink-900 (dark navy) pill, white text 17/600; unselected ink-700 17/500. Slides with spring (see motion). Max 3 segments.

## 7. Search form card (stacked rows)
A single surface card, r-3xl, `shadow-md`, rows separated by 1px `line`:
- **Route row:** two columns; each = overline code ("BBI", ink-500) + `display-md`-sized sans value (26/600 ink-900). Centre: 52px circle surface-2 with swap icon (overlaps both halves, `shadow-sm`).
- **Date row:** label `label-md` ink-500 + value `body-lg` 600; right column right-aligned; empty value shows "--" ink-300.
- **Travellers / Class row:** same pattern.
- **Chips row:** label + horizontal chips (height 48, r-md, 1px line, 16/500, 10px gap, overflow scroll).
- **Info row:** `sky` bg, 20 padding, checkbox 24 (r-sm, 2px line) + title 17/500 + sub 15 ink-500 + right illustration 56.
- **CTA row:** CTA button flush to card edges (border-radius only bottom corners r-3xl) - or 16px inset with r-xl.

## 8. Floating tab bar
Container: position fixed, bottom 16 + safe-area, left/right 20, height 72, `glass-strong`, r-pill, `shadow-lg` + glass highlight. Items: 4-5, icon 24 + label 12/500 ink-700. Active: pill behind item (`cta-500` at 12%, r-pill, 56x56 around icon or full item), icon `cta-500`, label `cta-500` 600. If a FAB/AI orb exists, it sits **outside** the pill to the right (64px, gradient-aurora, shadow-lg) and the pill shortens to leave 80px.

## 9. Campaign banner
Full-bleed inside gutter, r-3xl, height 200-240, `gradient-festive`, overlay: SVG string lights (two shallow curves of 2px dots, white/gold, with `filter: drop-shadow(0 0 4px gold)`), centre wordmark in display serif gold with slight 3D emboss (`text-shadow: 0 1px 0 #fff3, 0 4px 12px #0007`), small `aura-btn-primary` sm variant. Lights twinkle per motion.md.

## 10. Chips and badges
- Chip: 48 tall, r-md, 1px line, surface bg, 16/500. Selected: tile-100 bg, tile-500 border + text, leading check.
- Status badge: r-sm, 12/600, padding 3 10: New (lilac/mint), Pro (ink-900 bg white text, 10px, uppercase "PRO" with dotted pixel font feel), Off (`success` text on mint), Hot (cta-500 on `#FFF1E8`).
- Count badge: 18 circle `danger` white 11/700, top-right of icon, 2px surface ring.

## 11. Inputs
Height 56, r-lg, surface, 1px line, padding 0 16, label floats (label-md ink-500 above value body-lg). Focus: 2px tile-500 ring (box-shadow inset). Leading icon ink-500 22px. Error: danger border + helper 13px danger. Search field: r-pill, glass on header, surface-2 on body, leading search icon, trailing mic.

## 12. Lists and rows
Row: 72 tall, 16 padding, leading 44px rounded-square icon container (surface-2 or tile-100), title 17/500, subtitle 14 ink-500, trailing chevron ink-300 or value 17/600. Separators: 1px line inset by 76. Group rows in a surface card r-3xl.

## 13. Bottom sheet
Surface, r-3xl top, grabber 36x5 ink-300 at 8px, padding 20, max-height 90%, `shadow-lg`, backdrop ink-900 at 40% + blur 8. Title `title-lg`, close = glass circle 40 top-right.

## 14. Modal / dialog (web)
Centred, width 480, surface, r-3xl, padding 32, `shadow-lg`, same backdrop. Actions right-aligned: tertiary + primary (sm). Mobile: becomes a bottom sheet.

## 15. Toast
Glass pill, top 16 + safe-area, max-width 90%, icon 22 (success/danger/info colour) + text 15/500, `shadow-lg`.

## 16. Avatar and coin
Avatar 40/48 circle, 2px surface ring, fallback initials on tile-100/tile-700. Coin: 32 circle gradient-gold with inner ring `inset 0 0 0 3px #fff6` and a serif "₹" or star - sits in the header right glass circle.

## 17. Data display (dashboards - Keka / SaaS style)
- **Stat tile:** surface card r-3xl, padding 20; overline label; `display-md` value (count-up); delta chip (mint "+4.2%" or `#FFE4E4` "-1.1%" danger); 48px sparkline bottom (2px tile-500 line + 20% fill).
- **Progress ring:** 8px stroke, track surface-2, fill gradient-tile, value centred display-md.
- **Table (web):** header overline ink-500, rows 56, zebra none, hover surface-2, sticky header glass.
- **Calendar cell:** 40 circle; today = 2px tile-500 ring; selected = gradient-tile white text; events = 4px dots success/cta/danger.

## 18. Empty states
Centred illustration 160 (3D style), `title-md` + body ink-500 + secondary button. Background: faint radial glow of tile-100.

## 19. Onboarding / splash
Full-screen gradient-header (or aurora), display-xl white serif headline (2 lines), body white 80%, 3D hero floating, 3 pagination dots (8px, active 24px pill white), primary CTA white bg with brand-600 text (inverted) + tertiary "Skip" white 70%.

## 20. Brand splash (post-login / launch)
**Anatomy (Variant A, comet wordmark - default):** full-screen layer above the app (blocks input) > centred stack > scene 420x200 > `.shift` wrapper (starts +70px) > `.word` (HTML spans, one per letter, sans 800 84px, colour `--logo`) + `.fx` SVG overlay (3 trail paths, 3 comet polygons on `offset-path`, 3 spark polygons) > tagline (label-md + 3 dots).
**Anatomy (Variant B, mark + sparks):** mark 112x112 (glow + puck + SVG letter path + 3 spark strokes) > wordmark (display serif 34px, one span per letter) > tagline.
**Backgrounds:** `white` (surface bg) for post-login; `brand` (gradient-header bg, white logo) for cold start and onboarding.
**Timing and loop:** see `motion.md` section 8. Exit only once data is ready and the minimum time has passed (3.2s A / 2.4s B).
**Code (web, Variant A, no library - full CSS in `preview/splash.html`):**
```html
<div class="splash play" data-variant="comet" style="--logo: var(--aura-tile-500)">
  <div class="scene"><div class="shift">
    <div class="word"><span>a</span><span>u</span><span>r</span><span>a</span></div>
    <svg class="fx" viewBox="0 0 420 200">
      <path class="trail a" pathLength="1000" d="M165 45 C 120 8, 56 40, 64 100 S 150 182, 232 166 S 338 150, 318 52"/>
      <path class="trail b" pathLength="1000" d="M165 45 C 188 -22, 288 -26, 342 18 S 336 46, 318 50"/>
      <path class="trail c" pathLength="1000" d="M165 48 C 170 112, 238 152, 298 126 S 346 86, 320 50"/>
      <polygon class="comet a" points="0,-7 18,0 0,7"/><polygon class="comet b" points="0,-6 16,0 0,6"/><polygon class="comet c" points="0,-7 18,0 0,7"/>
      <polygon class="spark s1" points="306,52 318,44 318,58"/><polygon class="spark s2" points="314,40 326,28 330,44"/><polygon class="spark s3" points="326,50 344,46 336,62"/>
    </svg>
  </div></div>
  <div class="tagline">Signing you in <span class="dots"><i></i><i></i><i></i></span></div>
</div>
```
Key CSS: `.comet.a { offset-path: path("<same d as trail a>"); offset-rotate: auto }` animated `offset-distance: 0% -> 100%` with opacity 1 -> 0 over the last 12%; `.trail { stroke-dasharray: 110 1000 }` animated `stroke-dashoffset: 110 -> -890` (opacity to 0 over the last 20%); `.shift` animated `translateX(70px) -> 0`; letters `opacity 0 -> 1, translateX(-6px) scale(.9) -> none` staggered 180ms; sparks `scale 0 -> 1.25 -> 1`. Never put `offset-path` on the trail paths themselves.
**Code (web, Variant B):**
```html
<div class="splash play">
  <div class="stack">
    <div class="mark"><span class="glow"></span><span class="puck"></span>
      <svg viewBox="0 0 112 112"><path class="letter" d="<your logo outline>"/>
        <g><path class="spark" d="M84 26 L96 14"/><path class="spark" d="M86 32 L102 32"/><path class="spark" d="M80 18 L80 4"/></g></svg>
    </div>
    <div class="wordmark"><span>A</span><span>U</span><span>R</span><span>A</span></div>
    <div class="tagline">Signing you in <span class="dots"><i></i><i></i><i></i></span></div>
  </div>
</div>
```
Set `stroke-dasharray`/`stroke-dashoffset` of `.letter` to the path length (`path.getTotalLength()`); the full CSS keyframes are in `preview/splash.html` and can be copied as-is. To leave: add `.leave` (stack scales 1.12 + fades, layer fades 420ms) and add `.show` to the app root so its entrance choreography runs.

## 21. Desktop / web adaptations
- Max content width 1200; bento becomes 4 columns; tile row becomes a 6-8 column grid (no scroll).
- Floating tab bar becomes a left glass sidebar (88px icon rail, expands to 240 on hover) or a top glass nav bar (64px) - never a bottom bar on desktop.
- Hover states replace press on pointer devices; keep press for touch.
- Header gradient becomes a 320px hero band with the promo pill left and the search card overlapping it by 60px.
