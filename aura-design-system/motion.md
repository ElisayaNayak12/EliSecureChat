# AURA Motion System

Motion is the brand. The reference apps (Keka, Apple, premium travel apps) feel alive because everything moves with
physical, spring-based easing, enters in choreographed sequence and responds instantly to touch. This file defines
exactly how.

## 1. Principles
1. **Physical, not linear.** Use springs or expo-out. Never `ease`, `linear` or `ease-in` for UI movement.
2. **Fast in, slower out.** Entrances 260-420ms. Exits 160-200ms. Presses 80-160ms.
3. **Choreography beats speed.** Stagger siblings by 40ms (max 8 items, then the rest animate together). Parent before child. Header before body before tab bar.
4. **Motion has a reason.** Every animation communicates origin (where did this come from), state (what changed) or continuity (what stayed). Decorative loops are allowed only for hero imagery and the AI orb.
5. **Respect the user.** `prefers-reduced-motion` turns every translate/scale into a 150ms opacity fade; all springs become `ease-out`.
6. **60fps or nothing.** Animate only `transform`, `opacity`, `filter`, `clip-path`, `background-position`. Never `width/height/top/left/box-shadow` on mobile (use a pseudo-element with opacity for shadow changes).

## 2. Timing tokens
| Token | ms | Use |
|---|---|---|
| `dur-instant` | 80 | press down, ripple start |
| `dur-fast` | 160 | hover, press release, chip toggle, exit fades |
| `dur-base` | 260 | tab indicator, toggle thumb, tooltip, small sheet |
| `dur-slow` | 420 | screen entrance, card rise, bottom sheet, modal |
| `dur-cinematic` | 700 | hero parallax, onboarding scenes, success celebration |

Easing:
| Token | Value | Use |
|---|---|---|
| `ease-out-expo` | `cubic-bezier(0.16,1,0.3,1)` | default for everything that enters or moves |
| `ease-in-out` | `cubic-bezier(0.65,0,0.35,1)` | shimmer, looping, crossfades |
| `spring.snappy` | stiffness 400, damping 30 | tab switch, toggle, chip select |
| `spring.soft` | stiffness 220, damping 26 | cards, lists, fade-rise |
| `spring.bouncy` | stiffness 300, damping 18 | success check, badge pop, FAB, coin |
| `spring.sheet` | stiffness 320, damping 32 | bottom sheets, drawers, modals |

Framer Motion: `transition={{ type: "spring", stiffness: 400, damping: 30 }}`
SwiftUI: `.spring(response: 0.35, dampingFraction: 0.8)` (snappy) / `.spring(response: 0.5, dampingFraction: 0.75)` (soft)
Compose: `spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium)`
Flutter: `SpringSimulation` or `Curves.easeOutExpo` with 420ms.
React Native Reanimated: `withSpring(v, { damping: 30, stiffness: 400 })`.

## 3. The 4 mandatory states for every interactive element
| State | Spec |
|---|---|
| **Enter** | opacity 0 to 1, translateY 16 to 0, `dur-slow`, `ease-out-expo`, staggered 40ms within its group |
| **Hover (web) / Press (touch)** | hover: translateY -2px + shadow md to lg (via pseudo-element opacity), 160ms. press: scale 0.97, 80ms down / 160ms up; glossy tiles also brighten gloss to 0.7 |
| **Loading** | skeleton shimmer shaped like final content (1.4s loop). Buttons: label fades to 0, 20px spinner fades in, width locked, button stays pressed-looking (scale 0.98) |
| **Exit** | opacity 1 to 0, translateY 0 to -8, `dur-fast`, `ease-out-expo` (no stagger) |

## 4. Screen choreography (what happens on every screen load)
```
t=0      Header gradient already painted (never animate the background colour)
t=0      Header controls (menu, promo pill, coins) fade-rise, stagger 40ms
t=120    White content panel slides up 24px -> 0 with spring.soft, radius already 28
t=160    Bento cards rise, stagger 40ms left-to-right, top-to-bottom; the 3D render inside each card
         rises 24px with a 60ms extra delay (parallax feel) and settles with spring.bouncy
t=320    Icon tile row rises, stagger 40ms; halo pulses once (scale 1 -> 1.08 -> 1, 600ms)
t=420    Campaign banner fades in; string lights twinkle (random 1.2-2.4s opacity loops)
t=480    Floating tab bar rises from bottom (translateY 80 -> 0, spring.sheet) + the FAB/AI orb pops (scale 0.6 -> 1, spring.bouncy)
```
Total perceived load: under 700ms. If data isn't ready, cards render as skeletons and swap in place with a crossfade (no second entrance).

## 5. Per-component motion
### Bento card
- Enter: rise + image parallax (see choreography).
- Hover (web): card lifts -4px, image translates -6px and scales 1.04 (`dur-base`). Cursor pointer.
- Press: scale 0.97 whole card; on release, navigate with **shared-element transition**: the card's image and title morph into the next screen's hero (Framer `layoutId`, SwiftUI `matchedGeometryEffect`, Compose `SharedTransitionLayout`, Flutter `Hero`).
- Idle (optional, hero cards only): the 3D render floats +/-6px over 4s `ease-in-out` loop.

### Glossy icon tile
- Enter: rise, stagger 40ms.
- Press: scale 0.92 (tiles are small, so press deeper), gloss opacity 0.45 to 0.7, halo expands 8 to 12px. Release with spring.bouncy (slight overshoot to 1.03).
- Label stays still (only the puck moves).
- "New" badge: pops in after the tile (scale 0 to 1, spring.bouncy, +120ms).

### Primary CTA (orange)
- Idle: subtle sheen sweep every 6s (a 40% wide white gradient at 25% opacity, translateX -100% to 100% over 1.2s). Disable in reduced motion.
- Hover: lift -2px, shadow intensifies.
- Press: scale 0.97; arrow icon translates +4px.
- Loading: label to spinner (see states). Success: spinner morphs to check (draw stroke 300ms) and button background crossfades to `success` for 1.2s, then returns.

### Segmented control (One Way / Round Trip)
- Selected pill slides to the new segment with spring.snappy (`layoutId` / matchedGeometry). Text colour crossfades 160ms. Never re-render two pills.

### Swap button (circular arrows between From/To)
- On tap: rotates 180deg with spring.snappy; the two city labels crossfade and slide toward each other 12px (260ms).

### Floating tab bar
- Enter from bottom with spring.sheet.
- Active indicator: soft-filled pill (brand-100 / cta at 14%) slides between tabs with spring.snappy; icon scales 1 to 1.1 and tints to `cta-500`; label weight 500 to 600.
- Scroll behaviour: hides (translateY 100%) when scrolling down > 24px, shows on any upward scroll, 260ms expo-out.

### AI orb / FAB
- Idle: conic/aurora gradient rotates 360deg over 8s; outer halo pulses (pulse-halo keyframe).
- Press: scale 0.9 then expands into a sheet (morph: orb radius to 28px sheet corner, spring.sheet).

### Bottom sheet / modal
- Backdrop: opacity 0 to 0.4 (ink-900) over 260ms + `backdrop-filter: blur(8px)`.
- Sheet: translateY 100% to 0 with spring.sheet; drag-to-dismiss with velocity (dismiss if velocity > 500px/s or offset > 35%).
- Content inside the sheet staggers in after the sheet settles (+80ms).
- Grabber: 36x5px, ink-300, 999 radius.

### Inputs / search form rows
- Focus: 1px line to 2px `tile-500` border (via box-shadow inset), label floats up 4px and tints, 160ms.
- Error: shake 3x 4px over 300ms + border `danger`; helper text fade-rise.
- Date picker opens as a sheet; selected date scales 0.8 to 1 with spring.bouncy.

### Chips (Student / Senior Citizen / Armed Forces)
- Select: background crossfades to `tile-100`, border to `tile-500`, check icon draws in 200ms, chip scales 1.03 then 1 (spring.snappy).

### Toggle / checkbox (Always opt for Free Cancellation)
- Thumb slides with spring.snappy; track colour crossfades; checkbox tick draws (stroke-dashoffset) 240ms; the shield badge does a 1-shot wiggle (rotate -6 to 6 to 0, 400ms).

### Lists
- Items fade-rise with stagger (cap at 8). Pull-to-refresh: custom glossy orb that stretches (scaleY 1.3) and spins.
- Swipe actions reveal with spring.soft; destructive action background grows from the edge.

### Toast / snackbar
- Glass pill drops from top (translateY -24 to 0, spring.soft), auto-dismiss 3s with an exit slide up. Icon pops with spring.bouncy.

### Numbers / prices
- Count up from 0 (or from previous value) over 600ms ease-out-expo, tabular-nums so width doesn't jitter. Currency symbol static.

### Success / celebration (booking confirmed, leave approved)
- Full-screen: check circle draws (400ms), scale pop spring.bouncy, 24-40 confetti particles in brand/cta/tile/gold colours falling with slight rotation for 1.6s, haptic success. Then content rises in.

### Page transitions
- Push: incoming screen slides from right 100% to 0 with spring.sheet while outgoing moves to -24% and dims 20%. Pop reverses. Modal screens come from bottom.
- Tab switch: crossfade 160ms + 8px rise of the incoming tab; no horizontal slide.
- Web routes: use View Transitions API (`document.startViewTransition`) with the same 260ms expo-out crossfade, and shared-element names on hero images.

### Hero / parallax
- Header imagery moves at 0.4x scroll speed; header controls fade out by 80px scroll; the promo pill collapses to a 40px glass capsule.
- Section headers ("Deals & Offers") reveal on scroll-into-view (IntersectionObserver / `whileInView`) with rise, once.

### Skeletons
- Shimmer uses `gradient-shimmer`, 1.4s, `ease-in-out`, left-to-right. Skeleton blocks have the same radius as the final component. Replace with crossfade 260ms, never re-run entrance.

## 6. Haptics (mobile)
| Event | iOS | Android |
|---|---|---|
| Tile / card press | `.light` impact | `HapticFeedbackConstants.CONTEXT_CLICK` |
| Toggle / chip select | `.selection` | `CLOCK_TICK` |
| CTA success | `.success` notification | `CONFIRM` |
| Error | `.error` notification | `REJECT` |
| Sheet snap | `.medium` impact | `GESTURE_END` |

## 7. Reduced motion mapping
| Full motion | Reduced |
|---|---|
| rise (translate + fade) | fade 150ms |
| spring scale/press | none (opacity 0.85 on press) |
| shared-element morph | crossfade 150ms |
| shimmer loop | static surface-2 block |
| orb rotation, floats, sheen, twinkle | off |
| confetti | off (check icon fade only) |

## 8. Brand splash (post-login / app launch) - the "Keka moment"
When the user has just signed in, or the app cold-starts, show a full-screen brand splash while the first data loads.
It replaces a spinner with a short piece of theatre. Live demo: `preview/splash.html` (both variants, colour presets, hold-on-loop).
Reference frames of the original Keka post-login animation are in `reference/keka-splash-frames.jpg` (study the motion, never copy the logo).

### Variant A (default): Comet wordmark reveal
What the reference does, generalised for any wordmark: the first letter appears alone with the brand sparks clustered at its
top-right; the sparks launch as three "comets" (small triangles) that orbit the word on curved paths with faint trails; the
remaining letters reveal left-to-right while the word slides to stay centred; the comets land on the last letter and become
the static brand sparks. Total 2.1s, then hold.

```
t=0       First letter pops in: scale 0.6 -> 1, 520ms spring.bouncy. Three comets sit clustered at its top-right.
          The whole scene is offset +70px so the first letter is centred.
t=300ms   Comet A launches: big counter-clockwise orbit around the left and under the word  (1300ms, ease-in-out 0.45,0,0.2,1)
t=360ms   Comet B launches: arc over the top of the word                                     (1150ms)
t=420ms   Comet C launches: arc under the word, up the right side                           (1400ms)
          Each comet points along its path (offset-rotate auto) and drags a 110-unit trail at 32% opacity that fades out
          in the last 20% of the flight. Comets fade out in the last 12% of the flight, exactly at the spark position.
t=450ms   Scene slides from +70px to 0 (650ms expo-out) so the growing word stays centred.
t=520ms   Letter 2 reveals: opacity 0 -> 1, translateX -6 -> 0, scale 0.9 -> 1, 380ms expo-out
t=700ms   Letter 3 reveals (same)      t=880ms  Letter 4 reveals      (+180ms for each further letter)
t=1560ms  Spark 1 lands: scale 0 -> 1.25 -> 1, 520ms spring.bouncy   t=1640ms Spark 2   t=1720ms Spark 3
t=1900ms  Tagline "Signing you in" + bouncing dots fade-rise.
Loop      Sparks twinkle (opacity 1 -> 0.55 -> 1, 2.4s, 200ms stagger) until data is ready. Nothing else moves.
Exit      Stack scales 1 -> 1.12 and fades 300ms; layer fades 420ms; app runs its entrance choreography. Minimum 3.2s on screen.
```
Geometry (scene 420x200, word centred at y=100, first letter top-right at (165,45), sparks at (306-344, 28-62)):
- Comet A path `M165 45 C 120 8, 56 40, 64 100 S 150 182, 232 166 S 338 150, 318 52`
- Comet B path `M165 45 C 188 -22, 288 -26, 342 18 S 336 46, 318 50`
- Comet C path `M165 48 C 170 112, 238 152, 298 126 S 346 86, 320 50`
All three end at the spark cluster so the landing is seamless. For a longer wordmark, scale the x coordinates by (your word width / 190).
Colour: one brand colour for letters, comets, trails and sparks (`--logo`). Letters: sans 800, 84px, tracking -0.045em, lowercase reads best.

### Variant B: Mark + sparks (for apps with a symbol instead of a wordmark)
Timeline (total 2.4-2.8s if data is ready; loops section C until it is):
```
A. Reveal (0 - 900ms)
   0ms    Background already painted (surface white, or brand gradient for a bolder launch).
   0ms    Puck (112px rounded square, gradient-tile, shadow-tile) scales 0.6 -> 1 with spring.bouncy, 600ms.
   180ms  Logo letterform draws itself: SVG stroke, stroke-dasharray = path length, dashoffset -> 0, 700ms expo-out.
   420ms  Soft radial glow behind the mark fades in (tile-500 at 35%, blur 10px).
   520ms  Three accent "sparks" shoot out from the mark's top-right, staggered 80ms, each scale 0 -> 1.18 -> 1 (spring.bouncy). Colour cta-400.
   700ms  Wordmark letters rise in one by one (14px -> 0, 60ms stagger, serif display 34px, letter-spacing 0.08em).
   1000ms Tagline "Signing you in" + three bouncing dots fade-rise.
B. Settle (900 - 1200ms)  nothing moves except the dots.
C. Breathing loop (from 1200ms, while loading)
   Puck scale 1 -> 1.045 -> 1 over 2.4s ease-in-out.
   Glow opacity 0.7 -> 1 -> 0.7 and scale 1 -> 1.12, same period.
   Sparks "re-fire" every 2.4s: shrink to 0.7 / 40% opacity then pop back to 1.14 -> 1, staggered 80ms.
   Dots bounce 3px, 1.2s, 200ms stagger.
D. Exit (when data is ready, min total 2.4s so it never flashes)
   Whole stack scales 1 -> 1.12 and fades out, 300ms. Splash layer fades 420ms expo-out.
   The app screen underneath runs its normal entrance choreography (header first, then cards staggered 40ms).
```
Rules:
- Keep the mark monochrome on the puck (white on gradient, or brand on white) and use the accent colour only for the sparks.
- The splash must never show for less than 2.4s or more than 6s; after 6s show a text line ("Still loading your workspace") and keep the loop.
- Reduced motion: puck + wordmark fade in 150ms, no sparks loop, dots static; exit is a plain crossfade.
- Use the same splash for cold start, login success and workspace switching so the motion becomes a recognisable brand signature.
- Provide the logo as an SVG outline path (single stroke, round caps). If your logo cannot be stroked, scale-fade the filled logo 0.8 -> 1 instead of drawing it, and keep the sparks.

Platform notes (both variants): web = CSS only (see `preview/splash.html`): comets use CSS Motion Path (`offset-path` + `offset-distance` + `offset-rotate: auto`), trails use `stroke-dasharray` with `pathLength="1000"` and an animated `stroke-dashoffset`. Native: either export the same timeline as a Lottie (After Effects / LottieFiles) and play it with `lottie-react-native`, `lottie` (Flutter), `Lottie` (iOS) or `LottieAnimationView` (Android) with `loop` on the twinkle segment only, or build natively: SwiftUI `.keyframeAnimator` + `Path.trimmedPath` for comet position/trails and `trim(from:to:)` for stroke draws; Compose `PathMeasure.getPosTan` driven by `animateFloatAsState` for comets and `PathMeasure.getSegment` for trails; Flutter `PathMetric.getTangentForOffset` / `extractPath` inside a `CustomPainter` driven by a `TweenAnimationBuilder`; React Native Reanimated + `react-native-svg` with `useDerivedValue` sampling the path.

## 9. Implementation snippets
Web (CSS only):
```css
.enter { animation: aura-rise var(--aura-dur-slow) var(--aura-ease-out-expo) both; }
.enter:nth-child(n) { animation-delay: calc(var(--aura-stagger) * (var(--i, 0))); }
.press:active { transform: scale(var(--aura-press-scale)); transition: transform var(--aura-dur-instant); }
```
Framer Motion (React):
```tsx
const rise = { hidden: { opacity: 0, y: 16 }, show: (i = 0) => ({ opacity: 1, y: 0,
  transition: { type: "spring", stiffness: 220, damping: 26, delay: i * 0.04 } }) };
<motion.div variants={rise} initial="hidden" animate="show" custom={i} whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} />
```
SwiftUI:
```swift
.opacity(shown ? 1 : 0).offset(y: shown ? 0 : 16)
.animation(.spring(response: 0.5, dampingFraction: 0.75).delay(Double(i) * 0.04), value: shown)
.scaleEffect(pressed ? 0.97 : 1).animation(.spring(response: 0.3, dampingFraction: 0.8), value: pressed)
```
Jetpack Compose:
```kotlin
AnimatedVisibility(visible, enter = fadeIn(tween(420)) + slideInVertically(spring(0.75f, Spring.StiffnessMediumLow)) { 16 })
Modifier.graphicsLayer { scaleX = if (pressed) 0.97f else 1f; scaleY = scaleX }
```
Flutter:
```dart
AnimatedScale(scale: pressed ? 0.97 : 1, duration: 160.ms, curve: Curves.easeOutExpo)
// entrance: flutter_animate -> .animate(delay: (i*40).ms).fadeIn(duration: 420.ms).slideY(begin: 0.1, curve: Curves.easeOutExpo)
```
