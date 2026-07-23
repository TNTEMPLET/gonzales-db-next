"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ACCOUNT_SETUP_PREFILL_KEY,
  type AccountSetupPrefillPayload,
} from "@/lib/accountSetupPrefill";

type LoginResponse = {
  error?: string;
  canRegister?: boolean;
  email?: string;
  isCoach?: boolean;
  setupProfile?: {
    firstName?: string;
    lastName?: string;
    contactPhone?: string;
    ageGroup?: string;
    assignedTeam?: string;
  } | null;
};

function stashAccountSetupPrefill(payload: AccountSetupPrefillPayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ACCOUNT_SETUP_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    // ignore private mode / quota
  }
}

function getAccountSetupHref(loginResponse: LoginResponse, fallbackEmail: string) {
  const params = new URLSearchParams();
  params.set("email", loginResponse.email || fallbackEmail);
  if (loginResponse.setupProfile?.firstName) {
    params.set("firstName", loginResponse.setupProfile.firstName);
  }
  if (loginResponse.setupProfile?.lastName) {
    params.set("lastName", loginResponse.setupProfile.lastName);
  }
  if (loginResponse.setupProfile?.contactPhone) {
    params.set("contactPhone", loginResponse.setupProfile.contactPhone);
  }
  return `/account/setup?${params.toString()}`;
}

function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("gdb-auth-changed"));
}

/**
 * Members-only shop wall. Uses the same registered-user auth as site Login
 * (Google + email/password) and returns the user to /shop after sign-in.
 */
export default function ShopLoginGate({
  leagueName,
}: {
  leagueName: string;
}) {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const renderButton = () => {
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
            const json = (await apiResponse.json()) as LoginResponse;
            if (!apiResponse.ok) {
              if (json.canRegister) {
                stashAccountSetupPrefill({
                  email: (json.email || "").trim().toLowerCase(),
                  ...(typeof json.isCoach === "boolean"
                    ? { isCoach: json.isCoach }
                    : {}),
                  ...(json.setupProfile != null
                    ? { setupProfile: json.setupProfile }
                    : {}),
                });
                router.push(getAccountSetupHref(json, json.email || ""));
                return;
              }
              throw new Error(json.error || "Google sign-in failed");
            }
            notifyAuthChanged();
            router.refresh();
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Google sign-in failed");
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
        width: 320,
      });
    };

    if (window.google?.accounts?.id) {
      renderButton();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", renderButton, { once: true });
      return () => existing.removeEventListener("load", renderButton);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderButton;
    document.head.appendChild(script);
    return () => {
      script.onload = null;
    };
  }, [router]);

  async function submitLocalAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/dugout/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "login",
          email,
          password,
        }),
      });
      const json = (await response.json()) as LoginResponse;
      if (!response.ok) {
        if (json.canRegister) {
          stashAccountSetupPrefill({
            email: (json.email || email).trim().toLowerCase(),
            ...(password ? { password } : {}),
            ...(typeof json.isCoach === "boolean"
              ? { isCoach: json.isCoach }
              : {}),
            ...(json.setupProfile != null
              ? { setupProfile: json.setupProfile }
              : {}),
          });
          router.push(getAccountSetupHref(json, email));
          return;
        }
        throw new Error(json.error || "Sign-in failed");
      }
      setPassword("");
      notifyAuthChanged();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-800/40 bg-zinc-900/80 p-6 sm:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.35)]">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-700/40 bg-amber-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
        Members only
      </div>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-50">
        Sign in to view the shop
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        {leagueName} championship merch is limited to registered players and family
        members. Log in with the same account you use on this site (Google or email
        &amp; password). PayPal checkout links are not shown until you sign in.
      </p>

      <div className="mt-6 space-y-5">
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <div className="space-y-2">
            <div ref={googleButtonRef} className="flex min-h-11 justify-center" />
            <p className="text-center text-[11px] text-zinc-600">
              Prefer Google? Use the button above.
            </p>
          </div>
        ) : null}

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-wide">
            <span className="bg-zinc-900/80 px-3 text-zinc-500">or email</span>
          </div>
        </div>

        <form onSubmit={(e) => void submitLocalAuth(e)} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
              placeholder="you@example.com"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error ? (
          <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <p className="text-center text-xs text-zinc-500">
          New here?{" "}
          <Link
            href="/account/setup"
            className="font-semibold text-amber-200/90 hover:text-amber-100"
          >
            Create an account
          </Link>
          {" · "}
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
