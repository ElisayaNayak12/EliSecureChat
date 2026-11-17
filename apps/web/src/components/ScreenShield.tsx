import { useEffect, useRef, useState } from "react";

/**
 * Screenshot protection for the web app (chats AND calls).
 *
 * Browsers do not let any website block the operating system's screenshot tools, so this makes screenshots as
 * hard and as useless as a website can:
 *  - covers the screen the moment the Windows / Command key goes down (before Win+Shift+S, Cmd+Shift+3/4/5
 *    can capture), when the window loses focus (snipping tools, other apps) and when the tab is hidden;
 *  - wipes the clipboard after Print Screen, so the copied screenshot is gone;
 *  - blocks printing / "Save as PDF".
 * The Android app blocks screenshots completely (FLAG_SECURE).
 */
export default function ScreenShield({ onAttempt }: { onAttempt?: (how: string) => void }) {
  const [covered, setCovered] = useState(false);
  const [reason, setReason] = useState("");
  const release = useRef<number | null>(null);

  useEffect(() => {
    const cover = (why: string) => {
      setReason(why);
      setCovered(true);
      if (release.current) window.clearTimeout(release.current);
    };
    const uncoverSoon = (ms = 900) => {
      if (release.current) window.clearTimeout(release.current);
      release.current = window.setTimeout(() => {
        if (document.hasFocus() && !document.hidden) setCovered(false);
      }, ms);
    };
    const wipeClipboard = () => {
      navigator.clipboard?.writeText(" ").catch(() => undefined);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Windows key / Command key: the start of Win+Shift+S or Cmd+Shift+3/4/5.
      if (e.key === "Meta" || e.key === "OS" || (e.metaKey && e.shiftKey)) cover("Screenshots are not allowed");
      if (e.key === "PrintScreen") {
        cover("Screenshots are not allowed");
        wipeClipboard();
        onAttempt?.("print-screen");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        cover("Printing is not allowed");
        onAttempt?.("print");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        // Windows delivers only the key-up for Print Screen: the image is already on the clipboard, so replace it.
        wipeClipboard();
        window.setTimeout(wipeClipboard, 300);
        cover("Screenshots are not allowed");
        onAttempt?.("print-screen");
        uncoverSoon(1500);
        return;
      }
      if (e.key === "Meta" || e.key === "OS") uncoverSoon();
    };
    const onBlur = () => cover("Content hidden while EliSecureChat is not in front");
    const onFocus = () => uncoverSoon(400);
    const onVisibility = () => (document.hidden ? cover("Content hidden") : uncoverSoon(400));
    const onBeforePrint = () => {
      cover("Printing is not allowed");
      onAttempt?.("print");
    };
    const onContextMenu = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.("video, .chat-scroll-area, .call-screen")) e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeprint", onBeforePrint);
    document.addEventListener("contextmenu", onContextMenu);
    if (!document.hasFocus()) setCovered(true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeprint", onBeforePrint);
      document.removeEventListener("contextmenu", onContextMenu);
      if (release.current) window.clearTimeout(release.current);
    };
  }, [onAttempt]);

  return (
    <>
      {covered && (
        <div className="screen-shield-cover" role="status" onClick={() => setCovered(false)}>
          <div>
            <strong>🔒 Protected</strong>
            <span>{reason || "Content hidden"}</span>
            <small>Click here or return to the app to continue.</small>
          </div>
        </div>
      )}
    </>
  );
}
