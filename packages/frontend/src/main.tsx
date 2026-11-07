import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Must stay above the App import: Vite orders CSS by module graph, and component
// styles have to land after the tokens to be able to override the base layer.
import "./styles/tokens.css";
import { App } from "./App";
import { startInstallCapture } from "./install/installState";

startInstallCapture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
