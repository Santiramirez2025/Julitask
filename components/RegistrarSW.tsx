"use client";

import { useEffect } from "react";

/** Activa el modo instalable (PWA). Solo en producción, para no molestar al desarrollar. */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
