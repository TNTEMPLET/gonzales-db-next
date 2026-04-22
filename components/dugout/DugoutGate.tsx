"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DugoutGate() {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const loadGoogle = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          setBusy(true);
          setError("");

          try {
            const apiResponse = await fetch("/api/dugout/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: response.credential || "" }),
            });

            const json = await apiResponse.json();
            if (!apiResponse.ok) {
              throw new Error(json.error || "Google sign-in failed");
            }

            router.refresh();
          } catch (err: unknown) {
            setError(
              err instanceof Error ? err.message : "Google sign-in failed",
            );
          } finally {
            setBusy(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        text: "signin_with",
        width: 360,
      });
    };

    if (window.google?.accounts?.id) {
      loadGoogle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = loadGoogle;
    document.head.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [router]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 max-w-xl mx-auto">
      <h2 className="text-3xl font-bold tracking-tight mb-2">The Dugout</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Coaches-only league feed for updates, planning notes, and quick
        communication.
      </p>

      {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
        <div className="space-y-3">
          <div ref={googleButtonRef} className="min-h-11" />
          <p className="text-xs text-zinc-500">
            Sign in with Google using your registered coach account.
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-400">
          Google sign-in is not configured yet.
        </p>
      )}

      {busy ? (
        <p className="text-xs text-zinc-500 mt-4">Signing in...</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-300 border border-red-800 bg-red-950/40 rounded-lg px-3 py-2 mt-4">
          {error}
        </p>
      ) : null}
    </div>
  );
}
