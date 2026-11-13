import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import "./aura.css";
import "./verdant.css";
import "./themes.css";
import "./expressions.css";
import "./home.css";
import "./features.css";
import "./signconnect.css";
import "./accessibility.css";
import { applyCachedAccessibility } from "./preferences";
import { applyAppearance, cachedAppearance } from "./theme";

applyCachedAccessibility();
applyAppearance(cachedAppearance());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
