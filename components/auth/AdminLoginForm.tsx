"use client";

import { useEffect, useRef, useState } from "react";

type AdminLoginFormProps = {
  nextPath: string;
  initialError?: string | null;
};

export default function AdminLoginForm({
  nextPath,
  initialError = null,
}: AdminLoginFormProps) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState(initialError ?? "");
  const [googleBusy, setGoogleBusy] = useState(false);

  function notifyAuthChanged() {
    window.dispatchEvent(new Event("gdb-auth-changed"));
  }

  function redirectAfterLogin() {
    notifyAuthChanged();
    const target = nextPath || "/admin";
    const topWindow = window.top ?? window;
    topWindow.location.href = target;
  }

  useEffect(() => {
    setError(initialError ?? "");
  }, [initialError]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const loadGoogle = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          setGoogleBusy(true);
          setError("");

          try {
            const apiResponse = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ credential: response.credential || "" }),
            });

            const json = await apiResponse.json();
            if (!apiResponse.ok) {
              throw new Error(json.error || "Google sign-in failed");
            }

            if (!json.isAdmin) {
              setError(
                "Google sign-in succeeded, but your account is not an admin yet. Ask an existing admin to promote your registered user.",
              );
              return;
            }

            redirectAfterLogin();
          } catch (err: unknown) {
            setError(
              err instanceof Error ? err.message : "Google sign-in failed",
            );
          } finally {
            setGoogleBusy(false);
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
  }, [nextPath]);

  return (
    <div className="space-y-4">
      <form
        action="/api/admin/login/redirect"
        method="POST"
        className="space-y-4"
      >
        <input type="hidden" name="next" value={nextPath} />
        <input
          required
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Admin email"
          className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-base sm:text-sm"
        />
        <input
          required
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-base sm:text-sm"
        />
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg bg-brand-purple px-4 py-3 text-base font-semibold hover:bg-brand-purple-dark disabled:opacity-60 sm:text-sm"
        >
          Sign in
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <div className="h-px flex-1 bg-zinc-800" />
        OR
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
        <div className="space-y-2">
          <div ref={googleButtonRef} className="min-h-11" />
          {googleBusy ? (
            <p className="text-xs text-zinc-400">Signing in with Google...</p>
          ) : null}
          <p className="text-xs text-zinc-500">
            First-time Google sign-ins are registered automatically. Existing
            admins can then promote users to admin access.
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          Google sign-in is not configured yet.
        </p>
      )}

      {error ? (
        <p className="text-sm text-red-300 border border-red-800 bg-red-950/40 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
