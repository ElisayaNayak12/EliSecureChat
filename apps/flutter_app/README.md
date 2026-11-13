# EliSecureChat for Android (Flutter)

Native Android client for the same EliSecureChat server and accounts as the web app (`apps/web`).
Messages are **end-to-end encrypted**, compatible byte for byte with the web app. A web user and an
Android user can chat with each other, and compare the same safety code.

## What this first version does
- Sign in and sign up. The session is kept in Android's encrypted storage and the refresh token rotates.
- Chat list with live updates, unread counts and decrypted previews. Start a new chat by searching for a person.
- Encrypted one-to-one messaging: send and receive, delivered/read ticks, live over the socket with an HTTPS
  fallback.
- Security code check, the same 60 digits as on the web.
- A phone that was signed out remotely re-keys itself automatically. Old messages stay readable on it.
- Server address setting on the sign-in screen.
- Verdant light and dark themes.

**Not yet in the Android app** (use the web app for these meanwhile): voice messages, photos and files
(shown as a note), video calls, blocking, sign/caption assistance, push notifications.

## Build without installing anything: GitHub Actions
Every push that touches this folder runs `.github/workflows/flutter-android.yml` on GitHub:
1. `flutter create` generates the Android project, and `tool/patch_android.py` sets the permissions, app name and
   minimum Android version.
2. `flutter analyze` and `flutter test` run, including **web → Dart** crypto checks against vectors that
   `tool/gen_vectors.mjs` generates from the web app's current code.
3. `tool/verify_dart_envelope.mjs` checks **Dart → web**: the web crypto must decrypt and verify messages
   encrypted by Dart.
4. The debug and release APKs are uploaded as the run's artifact `elisecurechat-android`.

Set the default server with the repository variable `SERVER_URL`, or the *Run workflow* input.
Users can still change it on the sign-in screen.

## Build locally (optional, needs the Flutter SDK and Android SDK)
```bash
cd apps/flutter_app
flutter create --platforms=android --org com.elisecurechat --project-name elisecurechat .
python tool/patch_android.py
flutter pub get
node tool/gen_vectors.mjs && flutter test && node tool/verify_dart_envelope.mjs
flutter run --dart-define=SERVER_URL=http://10.0.2.2:3000     # emulator -> backend on this PC
```

## Layout
| Path | Purpose |
|---|---|
| `lib/crypto/envelope.dart` | E2EE envelope: P-256 ECDH + HKDF-SHA256 + AES-256-GCM, ECDSA P-256 (pointycastle, pure Dart) |
| `lib/crypto/e2ee_service.dart` | Device keys, key directory, background-isolate decryption, re-keying |
| `lib/api/api_client.dart` | REST client, native session (refresh token in secure storage, rotation) |
| `lib/realtime/socket_service.dart` | socket.io connection with token auth and acks |
| `lib/screens/` | Sign-in, chat list, conversation, settings |
| `test/` | Crypto interop tests and app unit tests |
| `tool/` | Vector generator, Dart → web verifier, Android project patcher |

## Security notes
- Private keys never leave the phone. They are stored with `flutter_secure_storage`, which is Android
  Keystore-backed.
- Release builds only talk to HTTPS servers. Debug builds also allow `http://` for local testing.
- Same limits as the web app: no ratchet (forward secrecy), and attachments are not end-to-end encrypted yet.
