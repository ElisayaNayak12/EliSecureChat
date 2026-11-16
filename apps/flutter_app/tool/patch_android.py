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
# Read contacts only after the person taps "Find friends" and allows it, to show who uses EliSecureChat.
if "android.permission.READ_CONTACTS" not in m:
    m = m.replace("<application", '<uses-permission android:name="android.permission.READ_CONTACTS" />\n    <application', 1)
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

# ---- App icon (approved "Signing Bubble" logo) ----
# Legacy icons for old launchers, plus an adaptive icon (gradient background + foreground) with a monochrome
# layer for Android 13+ themed icons. PNGs are generated from the brand SVGs and kept in tool/android_res.
import shutil
res_src = pathlib.Path(__file__).resolve().parent / "android_res"
res_dst = root / "src" / "main" / "res"
for res_dir in res_src.iterdir():
    if res_dir.is_dir():
        (res_dst / res_dir.name).mkdir(parents=True, exist_ok=True)
        for f in res_dir.iterdir():
            shutil.copy2(f, res_dst / res_dir.name / f.name)
(res_dst / "drawable").mkdir(parents=True, exist_ok=True)
NL = "\n"
(res_dst / "drawable" / "ic_launcher_background.xml").write_text(NL.join([
    '<?xml version="1.0" encoding="utf-8"?>',
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
    '    <gradient android:angle="315" android:startColor="#4E8150" android:centerColor="#25432D" android:endColor="#12231A" />',
    '</shape>', '']), encoding="utf-8")
adaptive = NL.join([
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <background android:drawable="@drawable/ic_launcher_background" />',
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />',
    '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />',
    '</adaptive-icon>', ''])
(res_dst / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (res_dst / "mipmap-anydpi-v26" / name).write_text(adaptive, encoding="utf-8")
m = main.read_text(encoding="utf-8")
if "android:roundIcon" not in m:
    m = m.replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"', 1)
    main.write_text(m, encoding="utf-8")
print("installed app icons (legacy, adaptive, themed)")

# ---- Screenshot and screen-recording protection (FLAG_SECURE) ----
# Android shows a black screen in screenshots, screen recordings, casting and the recent-apps preview.
kt_dir = root / "src" / "main" / "kotlin"
for activity in kt_dir.rglob("MainActivity.kt"):
    text = activity.read_text(encoding="utf-8")
    if "FLAG_SECURE" not in text:
        pkg = re.search(r"^package\s+([\w.]+)", text, re.M)
        activity.write_text(
            (f"package {pkg.group(1)}\n\n" if pkg else "")
            + "import android.os.Bundle\n"
            + "import android.view.WindowManager\n"
            + "import io.flutter.embedding.android.FlutterActivity\n\n"
            + "class MainActivity : FlutterActivity() {\n"
            + "    override fun onCreate(savedInstanceState: Bundle?) {\n"
            + "        super.onCreate(savedInstanceState)\n"
            + "        // Block screenshots and screen recording of the app (they come out black).\n"
            + "        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)\n"
            + "    }\n"
            + "}\n",
            encoding="utf-8",
        )
        print(f"enabled FLAG_SECURE in {activity.name}")

print("patched AndroidManifest.xml (INTERNET, label) and debug manifest (cleartext for testing)")
