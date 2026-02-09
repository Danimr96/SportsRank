"use client";

import type { AppEventInput } from "@/lib/telemetry/types";

function getSessionId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  const key = "sportsrank_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

export async function trackEvent(input: AppEventInput): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const body = JSON.stringify({
    ...input,
    ts: new Date().toISOString(),
    sessionId: getSessionId(),
    path: window.location.pathname,
  });

  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", blob);
      return;
    }

    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // keep telemetry best-effort only
  }
}
