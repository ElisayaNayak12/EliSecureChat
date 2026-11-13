# AURA Screen Patterns

Layouts for the screens almost every app needs. Each is composed only of components from `components.md`.
Dimensions are mobile (390px wide); desktop adaptations are at the end of `components.md`.

## A. Home / Launcher (the reference screen 1)
```
┌──────────────────────────────────┐
│ HEADER gradient-header           │  180px, safe-area top
│ (☰)  [badge | Flat 15% Off ›]  (🪙)│  glass circles 48, promo pill 56
├──────────────────────────────────┤  content panel r-3xl top, overlaps -24
│ ┌───────────┐ ┌────────────────┐ │
│ │ Flights   │ │ Trains    [img]│ │  bento: tall L (270) + 2 wide R (127 each, gap 16)
│ │ Up to 25% │ ├────────────────┤ │
│ │   [plane] │ │ Buses Flat 15% │ │
│ └───────────┘ └────────────────┘ │
│ ┌───────────┐ ┌────────────────┐ │
│ │ Hotels    │ │ Airport Cabs   │ │  mirrored row
│ │ Flat 80%  │ │  New    10% Off│ │
│ └───────────┘ └────────────────┘ │
│ ┌──────────────┐ ┌─────────────┐ │
│ │ (tile) Flight│ │ (orb) Your  │ │  feature cards 120
│ │  PRO  Tracker│ │  AI Agents  │ │
│ └──────────────┘ └─────────────┘ │
│  (●) (●) (●)New (●) (●…         │  glossy tile row, 5th peeking
│ Credit Group Metro Book Ho…      │
│ ┌──────────────────────────────┐ │
│ │  CAMPAIGN BANNER festive     │ │  200-240
│ └──────────────────────────────┘ │
│  Deals & Offers →   (display-md) │
│  [offer cards horizontal scroll] │
│                                  │
│   ( Home  Flights  Hotels  Trips ) (AI) │  floating glass pill tab bar + orb
└──────────────────────────────────┘
```
Rules: 2 bento rows max above the fold; tile row always visible without scrolling on a 844px tall screen; campaign banner is the first thing below the fold.

## B. Search / Form (the reference screen 2)
```
┌──────────────────────────────────┐
│ HEADER gradient-sky + clouds     │  120px
│ (☰)                         (🪙) │
│ ┌──────────────────────────────┐ │
│ │ ( One Way | Round Trip )     │ │  segmented, 56
│ ├──────────────────────────────┤ │
│ │ BBI              ⇄      HYD  │ │  route row 96
│ │ Bhubaneswar        Hyderabad │ │
│ ├──────────────────────────────┤ │
│ │ Departure Date   Return Date │ │  row 88
│ │ Thu, 24 Dec             --   │ │
│ ├──────────────────────────────┤ │
│ │ Travellers            Class  │ │  row 88
│ │ 1 Traveller        Economy   │ │
│ ├──────────────────────────────┤ │
│ │ Special Fares (Optional)     │ │  chips row 96
│ │ [Student][Senior][Armed F…]  │ │
│ ├──────────────────────────────┤ │
│ │ ☐ Always opt for Free Canc. 🛡│ │  sky info row 88
│ ├──────────────────────────────┤ │
│ │ [   Search Flights  →   ]    │ │  CTA 60, bottom corners r-3xl
│ └──────────────────────────────┘ │
│  (●)   (●)   (●)   (●)           │  tile row (light variant)
│  Deals & Offers →                │
│   ( Home  Flights  Hotels  Trips ) (AI) │
└──────────────────────────────────┘
```
The form card is the hero: it sits 32px below the header and casts `shadow-lg`. Tapping any row opens a bottom sheet (city picker with search, calendar, traveller stepper) - never navigates away.

## C. Results / List
Sky or canvas header 96 with back glass circle + a compact summary pill ("BBI → HYD · 24 Dec · 1") + filter glass circle. Sticky glass filter chip row below (Non-stop / Cheapest / Fastest / Airlines). List of result cards: surface r-3xl, padding 16; row 1 airline logo 32 + name 14 ink-500 + price right display-md; row 2 times 22/600 with duration/stops centred as a thin line with a dot; row 3 chips (Refundable, Meal) + "Book" sm primary. Skeletons on load; results stagger in.

## D. Detail / Product
Hero image 320 with parallax, glass back + share circles over it, content panel r-3xl overlapping -28 with grabber-style handle, title display-md, rating chip gold, price display-lg + unit, feature tile row (light tiles), description body-md ink-700, sticky bottom glass bar with price left and primary CTA right (CTA 48 tall, width 55%).

## E. Checkout / Review
Stepper (3 steps, 8px dots joined by 2px lines, active dot gradient-tile 12px). Stack of surface cards r-3xl: Traveller details (list rows + edit), Fare summary (rows with tabular prices; total row display-md), Offers (horizontal chips with gold coin), Payment (radio rows with provider logos). Sticky bottom bar: total + "Pay ₹x" primary. Success state uses the celebration animation.

## F. Dashboard (HR / SaaS like Keka)
Header: brand gradient 140 with greeting "Good morning, Elisaya" display-md white + avatar + bell. Content: 2x2 stat tiles (count-up), a "Today" card with a timeline (clock-in/clock-out glossy toggle button 72px gradient-tile with ring progress), quick-action tile row (Apply Leave, Regularise, Payslip, Holidays, Team), announcements list card, floating tab bar (Home, Me, Inbox, Team, More) with FAB "+".
Leave balance: progress rings in a horizontal scroll. Attendance calendar: cells per components §17.

## G. Profile / Settings
Header gradient 200 with centred 88px avatar (4px surface ring, gloss overlay), name display-md white, role 15 white 70%. Grouped list cards (Account, Preferences, Security, Support), each row with tile-100 icon container. Theme toggle row (System / Light / Dark segmented). Logout tertiary danger at bottom.

## H. Auth (login / OTP)
Sky or aurora gradient, logo top, display-xl headline, inputs with floating labels, primary CTA, social buttons as secondary (48, logo + text), OTP = 6 boxes 48x56 r-lg with tile-500 focus ring, auto-advance and paste support; resend timer tabular-nums.

## I. Onboarding
3 slides, each: gradient background shifts hue per slide (crossfade 420ms), 3D hero floating, headline display-xl white serif, body white 80%, dots, CTA inverted. Final slide CTA morphs into the auth screen's primary CTA via shared element.

## J. Empty / Error / Offline
Centred illustration 160, title-md, body ink-500, one secondary action. Offline shows a glass toast pinned top with a retry text button.

## K. Web landing page (marketing site)
1. Nav: 64 glass bar, logo left, 4 links, primary sm CTA right.
2. Hero: 640 tall gradient-header band with vignette, display-xl white serif (max 12 words), sub white 80%, two CTAs, a floating 3D device mockup with parallax on scroll and a soft ground glow.
3. Bento feature grid: 4 columns on desktop (tall + wide mix), each card as components §2 with icon tile instead of 3D render where no render exists.
4. Social proof: logo strip in glass pill, 3 testimonial cards (avatar + quote display-md serif italic).
5. Pricing: 3 cards; middle card has gradient-header bg white text and a "Popular" lilac badge, slightly larger (scale 1.04).
6. FAQ: accordion rows in a surface card, chevron rotates with spring.
7. Footer: ink-900 bg, 4 columns, serif wordmark, small print ink-500.
Scroll animations: every section `whileInView` rise once; hero device parallax 0.3x; numbers count up on view.
