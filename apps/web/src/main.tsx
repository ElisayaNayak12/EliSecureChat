import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import PhoneGate, { detectPhone } from "./components/PhoneGate";
import "./styles.css";
import "./aura.css";
import "./verdant.css";
import "./themes.css";
import "./expressions.css";
import "./home.css";
import "./features.css";
import "./brand.css";
import "./signconnect.css";
import "./accessibility.css";
import { applyCachedAccessibility } from "./preferences";
import { applyAppearance, cachedAppearance } from "./theme";

applyCachedAccessibility();
applyAppearance(cachedAppearance());

// Phones only get the installed app (it blocks screenshots and screen recording; phone browsers cannot).
const phone = detectPhone();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {phone ? <PhoneGate kind={phone} /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
