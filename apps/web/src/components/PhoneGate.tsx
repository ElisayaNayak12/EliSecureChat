import BrandMark from "./BrandMark";

/**
 * Phones never get the web app. Phone browsers cannot stop screenshots or screen recording, so chats and calls on
 * phones only open in the installed EliSecureChat app, which blocks both (Android FLAG_SECURE).
 */
export type PhoneKind = "android" | "ios" | null;

export function detectPhone(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> & { userAgentData?: { mobile?: boolean } } = navigator): PhoneKind {
  const ua = nav.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return "ios";
  if (nav.userAgentData?.mobile || /Mobile|Opera Mini|IEMobile|webOS|BlackBerry/i.test(ua)) return "android";
  return null;
}

export default function PhoneGate({ kind }: { kind: Exclude<PhoneKind, null> }) {
  return (
    <main className="phone-gate">
      <div className="phone-gate-card">
        <BrandMark size={72} />
        <h1>Open EliSecureChat in the app</h1>
        <p>
          To keep every chat and call private, EliSecureChat on phones works only in the app. The app blocks screenshots and screen
          recording; a phone browser cannot.
        </p>
        {kind === "android" ? (
          <>
            <a className="phone-gate-btn" href="/api/app/android" download>
              Download the Android app
            </a>
            <ol>
              <li>Tap <b>Download the Android app</b>.</li>
              <li>Open the downloaded <b>EliSecureChat.apk</b>. If asked, allow installing from this browser.</li>
              <li>Open the app and sign in with your phone number and password.</li>
            </ol>
          </>
        ) : (
          <p className="phone-gate-note">
            The iPhone app is not ready yet. Until then, please use EliSecureChat on an Android phone or on a computer.
          </p>
        )}
      </div>
    </main>
  );
}
