"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type AdminLoginFormProps = {
  nextPath: string;
};

export default function AdminLoginForm({ nextPath }: AdminLoginFormProps) {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function notifyAuthChanged() {
    window.dispatchEvent(new Event("gdb-auth-changed"));
  }

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
            const apiResponse = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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

            notifyAuthChanged();
            router.push(nextPath || "/news/admin");
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
  }, [nextPath, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Login failed");
      }

      notifyAuthChanged();
      router.push(nextPath || "/news/admin");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          required
          type="email"
          autoComplete="email"
          placeholder="Admin email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <input
          required
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <button
          disabled={busy}
          type="submit"
          className="w-full rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign in"}
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
