"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  ADMIN_VIEW_PREVIEW_CONTEXT_SESSION_KEY,
  ADMIN_VIEW_PREVIEW_SESSION_KEY,
  readAdminViewPreviewContext,
} from "@/components/admin/AdminRolePreviewControl";

type HmrState = "connecting" | "connected" | "disconnected" | "unsupported";

/**
 * Small dev-only HUD: confirms client hydration, HMR websocket, and admin preview blockers.
 * Renders only when NODE_ENV=development (stripped from production bundles via dead-code elimination).
 */
export default function DevLiveIndicator() {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [hmr, setHmr] = useState<HmrState>("connecting");
  const [previewBlocksUi, setPreviewBlocksUi] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const syncPreview = () => {
      const ctx = readAdminViewPreviewContext();
      const readonly = document.body.classList.contains("admin-preview-readonly");
      const onTournamentAdmin = pathname?.startsWith("/admin/tournament-brackets") ?? false;
      setPreviewBlocksUi(readonly && !onTournamentAdmin);
    };

    syncPreview();
    window.addEventListener("admin-view-preview-updated", syncPreview);
    const observer = new MutationObserver(syncPreview);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    return () => {
      window.removeEventListener("admin-view-preview-updated", syncPreview);
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/_next/webpack-hmr`;
    let ws: WebSocket | null = null;
    let cancelled = false;

    try {
      ws = new WebSocket(url);
      ws.addEventListener("open", () => {
        if (!cancelled) setHmr("connected");
      });
      ws.addEventListener("close", () => {
        if (!cancelled) setHmr("disconnected");
      });
      ws.addEventListener("error", () => {
        if (!cancelled) setHmr("disconnected");
      });
    } catch {
      setHmr("unsupported");
    }

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [pathname]);

  if (process.env.NODE_ENV !== "development" || dismissed) return null;

  const hmrOk = hmr === "connected";
  const allOk = hydrated && hmrOk && !previewBlocksUi;

  return (
    <div
      className="fixed bottom-3 right-3 z-[200] max-w-sm rounded-lg border px-3 py-2 text-[11px] shadow-lg backdrop-blur-sm"
      style={{
        borderColor: allOk ? "rgba(52,211,153,0.45)" : "rgba(251,191,36,0.55)",
        background: "rgba(9,9,11,0.92)",
        color: allOk ? "#a7f3d0" : "#fde68a",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold uppercase tracking-wide">
          {allOk ? "Dev live" : "Dev issue"}
        </p>
        <button
          type="button"
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Dismiss dev indicator"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      </div>
      <ul className="mt-1 space-y-0.5 text-zinc-300">
        <li>{hydrated ? "✓ Client hydrated (buttons should work)" : "… Waiting for React hydration"}</li>
        <li>
          {hmrOk
            ? "✓ Hot reload connected"
            : hmr === "connecting"
              ? "… Connecting hot reload…"
              : "✗ Hot reload blocked — hard refresh after next.config fix; check allowedDevOrigins"}
        </li>
        {previewBlocksUi ? (
          <li className="text-amber-200">
            ✗ Admin preview is blocking clicks — set View by role to Live access or click Reset Preview
          </li>
        ) : null}
      </ul>
      {previewBlocksUi ? (
        <button
          type="button"
          className="mt-2 rounded border border-amber-700/60 px-2 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-950/60"
          onClick={() => {
            window.sessionStorage.removeItem(ADMIN_VIEW_PREVIEW_CONTEXT_SESSION_KEY);
            window.sessionStorage.removeItem(ADMIN_VIEW_PREVIEW_SESSION_KEY);
            document.body.classList.remove("admin-preview-readonly");
            window.dispatchEvent(new Event("admin-view-preview-updated"));
            window.location.reload();
          }}
        >
          Reset preview &amp; reload
        </button>
      ) : null}
    </div>
  );
}
