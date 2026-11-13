import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import "./aura.css";
import "./verdant.css";
import "./signconnect.css";
import "./accessibility.css";
import { applyCachedAccessibility } from "./preferences";

applyCachedAccessibility();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
