import { useEffect } from "react";

export function useSecureScreen(enabled = true) {
  useEffect(() => {
    if (enabled) {
      // TODO: invoke native FLAG_SECURE module in Android integration.
      console.log("Enable secure screen");
    }
    return () => {
      if (enabled) console.log("Disable secure screen");
    };
  }, [enabled]);
}

