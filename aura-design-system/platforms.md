# AURA Platform Implementation Guide

The same tokens, five tech stacks. Pick your section, copy the setup, then build components per `components.md` and motion per `motion.md`.

## 1. Web - plain HTML/CSS/JS
1. Add fonts: `<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`
2. `<link rel="stylesheet" href="aura-design-system/foundations/tokens.css">` and add `class="aura"` to `<body>`.
3. Use the utility classes (`aura-card`, `aura-tile`, `aura-btn-primary`, `aura-glass`, `aura-rise`, `aura-press`, `aura-skeleton`).
4. Dark mode: automatic via `prefers-color-scheme`; toggle with `document.documentElement.dataset.theme = "dark" | "light"`.
5. Page transitions: `document.startViewTransition(() => render(next))` with `::view-transition-old/new(root) { animation-duration: 260ms; animation-timing-function: var(--aura-ease-out-expo) }`.
6. Icons: Lucide (`<script src="https://unpkg.com/lucide@0.460.0"></script>` then `lucide.createIcons()`), stroke 1.75.
See `preview/index.html` for a complete working example.

## 2. Web - React / Next.js + Tailwind + Framer Motion
```bash
npm i framer-motion lucide-react
```
`tailwind.config.js`: `presets: [require("./aura-design-system/foundations/tailwind.preset.js")]`, and import `tokens.css` in your global CSS.
Core primitives (put in `components/aura/`):
```tsx
// Rise.tsx - staggered entrance wrapper
import { motion } from "framer-motion";
export const rise = { hidden: { opacity: 0, y: 16 }, show: (i = 0) => ({ opacity: 1, y: 0,
  transition: { type: "spring", stiffness: 220, damping: 26, delay: i * 0.04 } }) };
export const Rise = ({ i = 0, children, className }) => (
  <motion.div variants={rise} initial="hidden" animate="show" custom={i} className={className}>{children}</motion.div>);

// BentoCard.tsx
export function BentoCard({ title, benefit, img, tall, onClick }) {
  return (
    <motion.article onClick={onClick} whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}
      className={`relative overflow-hidden bg-surface rounded-3xl shadow-md p-5 ${tall ? "row-span-2 min-h-[270px]" : "min-h-[127px]"}`}>
      <h2 className="font-display text-display-lg text-ink-900">{title}</h2>
      <p className="text-body-lg text-ink-700">{benefit.prefix} <b className="text-success font-semibold">{benefit.value}</b></p>
      <motion.img src={img} alt="" whileHover={{ scale: 1.04, y: -6 }} className="absolute -right-[10%] -bottom-[12%] w-[70%] drop-shadow-[0_16px_24px_rgba(11,18,32,0.18)] pointer-events-none" />
    </motion.article>);
}

// Tile.tsx
export const Tile = ({ icon: Icon, label, badge }) => (
  <motion.a whileTap={{ scale: 0.92 }} className="flex flex-col items-center gap-2 w-[72px] text-center">
    <span className="relative">
      {badge && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.12 }}
        className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-sm bg-lilac text-lilac-ink text-overline px-2.5 py-0.5 shadow-sm">{badge}</motion.span>}
      <span className="tile"><Icon size={28} strokeWidth={1.75} /></span>
    </span>
    <span className="text-label-sm text-ink-700 leading-4">{label}</span>
  </motion.a>);

// Segmented.tsx - uses layoutId for the sliding pill
export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex p-1 rounded-pill bg-surface-2 h-14">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} className="relative flex-1 text-body-lg">
          {value === o && <motion.span layoutId="seg" className="absolute inset-0 rounded-pill bg-ink-900" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
          <span className={`relative ${value === o ? "text-white font-semibold" : "text-ink-700"}`}>{o}</span>
        </button>))}
    </div>);
}

// TabBar.tsx - floating glass pill with sliding active pill
export function TabBar({ tabs, active, onChange }) {
  return (
    <motion.nav initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="fixed bottom-4 left-5 right-5 h-[72px] glass rounded-pill flex items-center px-2">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className="relative flex-1 h-14 flex flex-col items-center justify-center gap-0.5">
          {active === t.id && <motion.span layoutId="tab" className="absolute inset-0 rounded-pill bg-cta-500/12" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
          <t.icon size={24} className={`relative ${active === t.id ? "text-cta-500" : "text-ink-700"}`} />
          <span className={`relative text-[12px] ${active === t.id ? "text-cta-500 font-semibold" : "text-ink-700"}`}>{t.label}</span>
        </button>))}
    </motion.nav>);
}
```
Sheets: use `framer-motion` `drag="y"` with `dragConstraints={{ top: 0 }}` and dismiss on `info.velocity.y > 500 || info.offset.y > 0.35 * height`. Shared elements: give the card image and the detail hero the same `layoutId`.

## 3. React Native (Expo) + Reanimated + Moti
```bash
npx expo install react-native-reanimated expo-blur expo-linear-gradient expo-haptics lucide-react-native react-native-svg
npm i moti
```
Fonts: load Fraunces + Inter via `expo-font` (or use `PlayfairDisplay_700Bold` + `Inter` from `@expo-google-fonts`).
Tokens: import `foundations/tokens.json` and build a `theme.ts`:
```ts
import t from "./aura-design-system/foundations/tokens.json";
export const theme = (dark: boolean) => ({ ...t.color.light, ...(dark ? t.color.dark : {}), radius: t.radius, space: t.space, spring: t.motion.spring });
```
Primitives:
```tsx
// Glass: <BlurView intensity={40} tint={dark ? "dark" : "light"} style={{ borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: glassBorder }} />
// Header gradient: <LinearGradient colors={["#B3121F", "#8F0E19", "#6E0A12"]} locations={[0, 0.55, 1]} />
// Tile gradient: <LinearGradient colors={["#6FA3FF", "#1E6BFF", "#0A3FCC"]} start={{x:0.3,y:0.15}} end={{x:1,y:1}} style={{ width:64, height:64, borderRadius:22 }} />
//   + gloss overlay: <LinearGradient colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]} style={StyleSheet.absoluteFill} start={{x:0.3,y:0}} end={{x:0.5,y:0.6}} />
// Shadows (iOS): shadowColor "#1E6BFF", shadowOpacity 0.45, shadowRadius 16, shadowOffset {0,12}; Android: elevation 12 + a hue-tinted View behind for the halo.
// Press: const s = useSharedValue(1); onPressIn -> s.value = withSpring(0.97, {stiffness:400, damping:30}); onPressOut -> withSpring(1)
// Entrance (moti): <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: "spring", stiffness: 220, damping: 26, delay: i * 40 }} />
// Haptics: Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) on tile press; Haptics.notificationAsync(Success) on CTA success.
// Sheet: @gorhom/bottom-sheet with animationConfigs = useBottomSheetSpringConfigs({ stiffness: 320, damping: 32 })
// Shared element: react-native-screens / expo-router sharedTransitionTag on the image.
```

## 4. Flutter
`pubspec.yaml`: `google_fonts`, `flutter_animate`, `glassmorphism` (or BackdropFilter), `flutter_svg`, `lucide_icons`.
```dart
// theme.dart
final auraLight = ThemeData(
  scaffoldBackgroundColor: const Color(0xFFF5F6FA),
  colorScheme: const ColorScheme.light(primary: Color(0xFFF26A1B), secondary: Color(0xFF1E6BFF), surface: Colors.white),
  textTheme: TextTheme(
    displayLarge: GoogleFonts.fraunces(fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: -0.64, height: 1.12),
    displayMedium: GoogleFonts.fraunces(fontSize: 26, fontWeight: FontWeight.w600, letterSpacing: -0.52),
    titleLarge: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w600),
    bodyLarge: GoogleFonts.inter(fontSize: 17, fontWeight: FontWeight.w500),
    bodyMedium: GoogleFonts.inter(fontSize: 15),
    labelMedium: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w500, color: const Color(0xFF6B7385)),
  ),
  cardTheme: CardTheme(color: Colors.white, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28))),
);
// Card shadow: BoxDecoration(borderRadius: 28, color: white, boxShadow: [BoxShadow(color: Color(0x240B1220), blurRadius: 30, offset: Offset(0, 10), spreadRadius: -12)])
// Tile: Container(64x64, decoration: BoxDecoration(borderRadius: 22, gradient: RadialGradient(center: Alignment(-0.4,-0.7), radius: 1.2, colors: [0xFF6FA3FF, 0xFF1E6BFF, 0xFF0A3FCC], stops: [0, .45, 1]), boxShadow: [BoxShadow(color: Color(0x731E6BFF), blurRadius: 32, offset: Offset(0,12), spreadRadius: -8)]))
// Glass: ClipRRect(borderRadius: 999, child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24), child: Container(color: Colors.white.withOpacity(.62), border: Border.all(color: Colors.white.withOpacity(.75)))))
// Entrance: widget.animate(delay: (i * 40).ms).fadeIn(duration: 420.ms, curve: Curves.easeOutExpo).slideY(begin: .08, end: 0, curve: Curves.easeOutExpo)
// Press: AnimatedScale(scale: pressed ? .97 : 1, duration: 160.ms, curve: Curves.easeOutExpo)
// Sheet: showModalBottomSheet(shape: RoundedRectangleBorder(borderRadius: vertical(top: 28)), backgroundColor: surface, barrierColor: Color(0x660B1220))
// Shared element: Hero(tag: 'card-flights', child: image)
// Haptics: HapticFeedback.lightImpact() / selectionClick()
```

## 5. iOS - SwiftUI
```swift
// AuraTokens.swift
enum Aura {
  static let canvas = Color(hex: 0xF5F6FA), surface = Color.white, ink900 = Color(hex: 0x0B1220), ink700 = Color(hex: 0x2A3242), ink500 = Color(hex: 0x6B7385)
  static let brand600 = Color(hex: 0xB3121F), brand900 = Color(hex: 0x6E0A12), cta500 = Color(hex: 0xF26A1B), cta400 = Color(hex: 0xF7931E)
  static let tile500 = Color(hex: 0x1E6BFF), tile300 = Color(hex: 0x6FA3FF), tile700 = Color(hex: 0x0A3FCC), success = Color(hex: 0x0E8A4E)
  static let header = LinearGradient(colors: [brand600, Color(hex: 0x8F0E19), brand900], startPoint: .top, endPoint: .bottom)
  static let cta = LinearGradient(colors: [cta400, cta500], startPoint: .top, endPoint: .bottom)
  static let tile = RadialGradient(colors: [tile300, tile500, tile700], center: UnitPoint(x: 0.3, y: 0.15), startRadius: 0, endRadius: 80)
  static func display(_ size: CGFloat, _ w: Font.Weight = .bold) -> Font { .system(size: size, weight: w, design: .serif) } // New York
  static func sans(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font { .system(size: size, weight: w, design: .default) }
  static let snappy = Animation.spring(response: 0.35, dampingFraction: 0.8)
  static let soft = Animation.spring(response: 0.5, dampingFraction: 0.75)
  static let bouncy = Animation.spring(response: 0.45, dampingFraction: 0.6)
}
// Card: .padding(20).background(Aura.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous)).shadow(color: Aura.ink900.opacity(0.14), radius: 15, y: 10)
// Glass: .background(.ultraThinMaterial, in: Capsule()).overlay(Capsule().strokeBorder(.white.opacity(0.6), lineWidth: 1))
// Tile: ZStack { RoundedRectangle(22, .continuous).fill(Aura.tile); RoundedRectangle(22).fill(RadialGradient(colors: [.white.opacity(0.55), .clear], center: UnitPoint(x:0.3,y:0.18), startRadius: 0, endRadius: 40)); Image(systemName:) }.frame(64,64).shadow(color: Aura.tile500.opacity(0.45), radius: 16, y: 12)
// Press: .scaleEffect(isPressed ? 0.97 : 1).animation(Aura.snappy, value: isPressed) via ButtonStyle
// Entrance: .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 16).animation(Aura.soft.delay(Double(i) * 0.04), value: shown)
// Segmented / tab pill: @Namespace + .matchedGeometryEffect(id: "pill", in: ns)
// Shared element (iOS 18+): .navigationTransition(.zoom(sourceID:, in:)); or matchedGeometryEffect
// Sheet: .sheet { ... .presentationDetents([.medium, .large]).presentationCornerRadius(28).presentationBackground(.regularMaterial) }
// Haptics: UIImpactFeedbackGenerator(style: .light).impactOccurred(); UINotificationFeedbackGenerator().notificationOccurred(.success)
// Reduced motion: @Environment(\.accessibilityReduceMotion)
```

## 6. Android - Jetpack Compose
```kotlin
// AuraTheme.kt
val Canvas = Color(0xFFF5F6FA); val Surface = Color.White; val Ink900 = Color(0xFF0B1220); val Ink700 = Color(0xFF2A3242); val Ink500 = Color(0xFF6B7385)
val Brand600 = Color(0xFFB3121F); val Brand900 = Color(0xFF6E0A12); val Cta500 = Color(0xFFF26A1B); val Cta400 = Color(0xFFF7931E)
val Tile500 = Color(0xFF1E6BFF); val Tile300 = Color(0xFF6FA3FF); val Tile700 = Color(0xFF0A3FCC); val Success = Color(0xFF0E8A4E)
val HeaderGradient = Brush.verticalGradient(0f to Brand600, 0.55f to Color(0xFF8F0E19), 1f to Brand900)
val CtaGradient = Brush.verticalGradient(listOf(Cta400, Cta500))
val TileGradient = Brush.radialGradient(0f to Tile300, 0.45f to Tile500, 1f to Tile700, center = Offset(20f, 10f), radius = 90f)
val Display = FontFamily(Font(R.font.fraunces_bold, FontWeight.Bold), Font(R.font.fraunces_semibold, FontWeight.SemiBold))
val Sans = FontFamily(Font(R.font.inter_regular), Font(R.font.inter_medium, FontWeight.Medium), Font(R.font.inter_semibold, FontWeight.SemiBold))
val AuraTypography = Typography(
  displayLarge = TextStyle(Display, 32.sp, FontWeight.Bold, letterSpacing = (-0.64).sp, lineHeight = 36.sp),
  displayMedium = TextStyle(Display, 26.sp, FontWeight.SemiBold, letterSpacing = (-0.52).sp),
  titleLarge = TextStyle(Sans, 22.sp, FontWeight.SemiBold), bodyLarge = TextStyle(Sans, 17.sp, FontWeight.Medium), bodyMedium = TextStyle(Sans, 15.sp),
  labelMedium = TextStyle(Sans, 14.sp, FontWeight.Medium, color = Ink500), labelSmall = TextStyle(Sans, 13.sp, FontWeight.Medium))
val Shapes = Shapes(small = RoundedCornerShape(14.dp), medium = RoundedCornerShape(20.dp), large = RoundedCornerShape(28.dp))
// Card: Modifier.shadow(20.dp, RoundedCornerShape(28.dp), ambientColor = Ink900.copy(.14f), spotColor = Ink900.copy(.14f)).background(Surface, RoundedCornerShape(28.dp)).padding(20.dp)
// Tile: Box(Modifier.size(64.dp).shadow(16.dp, RoundedCornerShape(22.dp), spotColor = Tile500.copy(.45f)).background(TileGradient, RoundedCornerShape(22.dp)).drawWithContent { drawContent(); drawRoundRect(Brush.radialGradient(listOf(Color.White.copy(.55f), Color.Transparent), center = Offset(size.width*.3f, size.height*.18f), radius = size.width*.6f), cornerRadius = CornerRadius(22.dp.toPx())) })
// Glass: Modifier.background(Color.White.copy(.62f), CircleShape).border(1.dp, Color.White.copy(.75f), CircleShape) + Haze library (dev.chrisbanes.haze) for real blur
// Press: val scale by animateFloatAsState(if (pressed) 0.97f else 1f, spring(0.8f, Spring.StiffnessMedium)); Modifier.graphicsLayer { scaleX = scale; scaleY = scale }
// Entrance: AnimatedVisibility(visibleState, enter = fadeIn(tween(420, i*40)) + slideInVertically(spring(0.75f, Spring.StiffnessMediumLow), initialOffsetY = { 16 }))
// Segmented / tabs: animateDpAsState for pill offset with spring(0.8f, Spring.StiffnessMedium)
// Shared element: SharedTransitionLayout + Modifier.sharedElement(rememberSharedContentState("card-flights"), animatedVisibilityScope)
// Sheet: ModalBottomSheet(shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), scrimColor = Ink900.copy(.4f))
// Haptics: LocalHapticFeedback.current.performHapticFeedback(HapticFeedbackType.LongPress / TextHandleMove)
```

## 7. Figma (optional)
Import `foundations/tokens.json` with the "Tokens Studio" plugin -> creates colour/typography/radius/shadow styles. Use Auto Layout with 20 gutters, 16 gaps; corner smoothing 60% (iOS-style continuous corners).

## 8. Assets checklist
- Fonts: Fraunces (variable) + Inter (variable). Licence: OFL, free.
- Icons: Lucide (web/RN/Flutter), SF Symbols (iOS), Material Symbols Rounded (Android).
- 3D renders: transparent PNG/WebP 2x, 512px, lit from top-left. Sources: Spline exports, Blender, or icon packs (e.g. 3dicons.co, free). Keep a consistent light direction across all renders.
- Lottie/Rive: AI orb, success check, confetti, pull-to-refresh orb.
