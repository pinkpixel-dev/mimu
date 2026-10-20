import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import { CaptureScreen } from "./features/capture/CaptureScreen.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CaptureScreen />
  </StrictMode>,
);
