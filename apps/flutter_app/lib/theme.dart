import 'package:flutter/material.dart';

/// "Verdant Glass" colours, matching the web app (apps/web/src/verdant.css).
class Verdant {
  static const brand900 = Color(0xFF0E1912);
  static const brand700 = Color(0xFF1A2B1F);
  static const brand600 = Color(0xFF2A4030);
  static const brand400 = Color(0xFF557558);
  static const brand100 = Color(0xFFE6EEE0);
  static const cta = Color(0xFF2F4A34);
  static const onCta = Color(0xFFF2F7EA);
  static const tile300 = Color(0xFFA8C596);
  static const tile500 = Color(0xFF5E8A5C);
  static const mint = Color(0xFFE1EED6);
  static const canvas = Color(0xFFECEFE7);
  static const surface = Color(0xFFFAFBF7);
  static const surface2 = Color(0xFFF0F3EB);
  static const ink900 = Color(0xFF16241A);
  static const ink700 = Color(0xFF33443A);
  static const ink500 = Color(0xFF6B796D);
  static const danger = Color(0xFFDC2626);

  // Dark mode
  static const darkCanvas = Color(0xFF0F1813);
  static const darkSurface = Color(0xFF17231B);
  static const darkSurface2 = Color(0xFF1F2D23);
  static const darkInk900 = Color(0xFFEEF3EA);
  static const darkInk500 = Color(0xFF94A492);
  static const darkCta = Color(0xFFBFD4A7);
  static const darkOnCta = Color(0xFF15231A);

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness b) {
    final dark = b == Brightness.dark;
    final scheme = ColorScheme(
      brightness: b,
      primary: dark ? darkCta : cta,
      onPrimary: dark ? darkOnCta : onCta,
      secondary: tile500,
      onSecondary: Colors.white,
      error: danger,
      onError: Colors.white,
      surface: dark ? darkSurface : surface,
      onSurface: dark ? darkInk900 : ink900,
      surfaceContainerHighest: dark ? darkSurface2 : surface2,
      onSurfaceVariant: dark ? darkInk500 : ink500,
      outline: dark ? const Color(0x24E2F0D6) : const Color(0x1716241A),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: dark ? darkCanvas : canvas,
      appBarTheme: AppBarTheme(
        backgroundColor: dark ? darkCanvas : brand700,
        foregroundColor: dark ? darkInk900 : const Color(0xFFEEF3E6),
        elevation: 0,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? darkSurface2 : surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(50),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        ),
      ),
    );
  }
}
