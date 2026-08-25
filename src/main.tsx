import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Desregistrar service workers legacy que puedan interferir con requests a Supabase
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
