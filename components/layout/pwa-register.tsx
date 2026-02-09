"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    const isProduction = process.env.NODE_ENV === "production";
    if (!isProduction) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No-op: keep PWA registration best-effort.
    });
  }, []);

  return null;
}
