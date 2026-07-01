# Mobile Starter Source

This folder contains React Native screen/component starter files.

To run mobile:

1. Create a React Native CLI app.
2. Copy `src/*` from this folder into the RN app `src/`.
3. Install dependencies:
   - `socket.io-client`
   - `react-native-biometrics` (for real biometric flow)
4. Wire `App.tsx` as app entry.

Security TODO before release:

- Integrate Android `FLAG_SECURE` native module
- Replace placeholder encryption with libsignal implementation
- Store private keys only in secure hardware-backed keystore

