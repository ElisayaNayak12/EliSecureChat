"""Adjusts the Android project that `flutter create` generates (run after it, from apps/flutter_app).

- INTERNET permission in the main manifest (release builds need it; Flutter only adds it for debug).
- Plain-HTTP servers allowed ONLY in debug builds (for http://10.0.2.2:3000 / LAN testing). Release builds
  require HTTPS.
- App name "EliSecureChat".
- minSdk at least 24 (flutter_secure_storage needs it).
Idempotent: safe to run more than once.
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent / "android" / "app"
main = root / "src" / "main" / "AndroidManifest.xml"
debug = root / "src" / "debug" / "AndroidManifest.xml"
if not main.exists():
    sys.exit("android/ not found: run `flutter create --platforms=android .` first")

m = main.read_text(encoding="utf-8")
if "android.permission.INTERNET" not in m:
    m = m.replace("<application", '<uses-permission android:name="android.permission.INTERNET" />\n    <application', 1)
m = re.sub(r'android:label="[^"]*"', 'android:label="EliSecureChat"', m, count=1)
main.write_text(m, encoding="utf-8")

d = debug.read_text(encoding="utf-8") if debug.exists() else (
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n'
)
if "usesCleartextTraffic" not in d:
    d = d.replace("</manifest>", '    <application android:usesCleartextTraffic="true" />\n</manifest>', 1)
debug.parent.mkdir(parents=True, exist_ok=True)
debug.write_text(d, encoding="utf-8")

for name in ("build.gradle.kts", "build.gradle"):
    g = root / name
    if not g.exists():
        continue
    t = g.read_text(encoding="utf-8")
    if name.endswith(".kts"):
        t = re.sub(r"minSdk\s*=\s*flutter\.minSdkVersion", "minSdk = maxOf(flutter.minSdkVersion, 24)", t)
    else:
        t = re.sub(r"minSdkVersion\s+flutter\.minSdkVersion", "minSdkVersion Math.max(flutter.minSdkVersion, 24)", t)
    g.write_text(t, encoding="utf-8")
    print(f"patched {g.name}")

print("patched AndroidManifest.xml (INTERNET, label) and debug manifest (cleartext for testing)")
