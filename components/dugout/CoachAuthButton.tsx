"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CoachUser = {
  name: string;
  firstName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

type MeResponse = {
  user: CoachUser | null;
};

type LoginResponse = {
  error?: string;
  canRegister?: boolean;
  isCoach?: boolean;
  isAdmin?: boolean;
};

type CoachAuthButtonProps = {
  mobile?: boolean;
  onNavigate?: () => void;
  onAuthenticated?: () => void;
  onOpen?: () => void;
  avatarOnly?: boolean;
  avatarSize?: number;
};

function getInitial(user: CoachUser): string {
  return (user.firstName?.[0] ?? user.name?.[0] ?? "?").toUpperCase();
}

function getPostLoginHref(loginResponse: LoginResponse): string {
  return loginResponse.isCoach ? "/dugout" : "/";
}

function AvatarBubble({
  user,
  size = "sm",
}: {
  user: CoachUser;
  size?: "sm" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "w-20 h-20 text-3xl border-2" : "w-7 h-7 text-xs border";

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className={`${sizeClass} rounded-full object-cover border-zinc-600 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-brand-purple border-zinc-600 flex items-center justify-center font-bold text-white shrink-0 select-none`}
    >
      {getInitial(user)}
    </div>
  );
}

export default function CoachAuthButton({
  mobile = false,
  onNavigate,
  onAuthenticated,
  onOpen,
  avatarOnly = false,
  avatarSize = 48,
}: CoachAuthButtonProps) {
  const router = useRouter();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<CoachUser | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [requiresRegistration, setRequiresRegistration] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [notice, setNotice] = useState("");

  const displayLabel = user
    ? (user.firstName ?? user.name.split(" ")[0])
    : "Login";

  const triggerClassName = mobile
    ? "w-full text-left text-lg hover:text-brand-gold"
    : "hover:text-brand-gold transition-colors";

  function notifyAuthChanged() {
    window.dispatchEvent(new Event("gdb-auth-changed"));
  }

  async function refreshUser() {
    try {
      const res = await fetch("/api/dugout/me", {
        cache: "no-store",
      });
      const json = (await res.json()) as MeResponse;
      setUser(json.user ?? null);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    void refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open || user !== null) return;

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
              throw new Error(json.error || "Sign-in failed");
            }
            await refreshUser();
            setOpen(false);
            notifyAuthChanged();
            onAuthenticated?.();
            router.push(getPostLoginHref(json));
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Sign-in failed");
          } finally {
            setBusy(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "medium",
        text: "signin_with",
        width: 210,
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
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = renderButton;
      document.head.appendChild(script);
    }
  }, [open, user, router]);

  function openModal() {
    setError("");
    setNotice("");
    setRequiresRegistration(false);
    setOpen(true);
    onOpen?.();
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  async function submitLocalAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/dugout/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: requiresRegistration ? "signup" : "login",
          email,
          password,
          firstName: requiresRegistration ? firstName : undefined,
          lastName: requiresRegistration ? lastName : undefined,
        }),
      });
      const json = (await response.json()) as LoginResponse;

      if (!response.ok) {
        if (json.canRegister) {
          setRequiresRegistration(true);
          setNotice(
            "No local account found. Complete registration below to create one.",
          );
        }
        throw new Error(json.error || "Local auth failed");
      }

      if (requiresRegistration) {
        setNotice("Local login enabled for this account.");
      }

      await refreshUser();
      setPassword("");
      setOpen(false);
      notifyAuthChanged();
      onAuthenticated?.();
      router.push(getPostLoginHref(json));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Local auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await Promise.all([
        fetch("/api/dugout/auth/logout", { method: "POST" }),
        fetch("/api/admin/logout", { method: "POST" }),
      ]);
      setUser(null);
      setOpen(false);
      notifyAuthChanged();
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/dugout/avatar", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as {
        error?: string;
        data?: { avatarUrl?: string };
      };
      if (!response.ok) {
        throw new Error(json.error || "Upload failed");
      }

      const uploadedAvatarUrl = json.data?.avatarUrl;
      if (uploadedAvatarUrl) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                avatarUrl: uploadedAvatarUrl,
              }
            : prev,
        );
        setNotice("Profile photo updated.");
      }

      await refreshUser();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={user === undefined}
        onClick={openModal}
        className={`${avatarOnly ? "" : triggerClassName} disabled:opacity-60 inline-flex items-center gap-2`}
      >
        {user ? (
          avatarOnly ? (
            user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                width={avatarSize}
                height={avatarSize}
                style={{ width: avatarSize, height: avatarSize }}
                className="rounded-full object-cover shrink-0"
              />
            ) : (
              <div
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  fontSize: avatarSize * 0.35,
                }}
                className="rounded-full bg-brand-purple flex items-center justify-center font-bold text-white shrink-0"
              >
                {getInitial(user)}
              </div>
            )
          ) : (
            <>
              <AvatarBubble user={user} size="sm" />
              <span>{displayLabel}</span>
            </>
          )
        ) : avatarOnly ? null : (
          <span>{displayLabel}</span>
        )}
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-9999 bg-black/70 p-4 flex items-center justify-center"
              onClick={closeModal}
            >
              <div
                className="w-full max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                  <h3 className="text-lg font-semibold">
                    {user ? "Your Account" : "Login"}
                  </h3>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-sm hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>

                <div className="p-5">
                  {user ? (
                    <div className="space-y-4">
                      {/* Avatar + name */}
                      <div className="flex flex-col items-center gap-3 py-2">
                        <AvatarBubble user={user} size="lg" />
                        <div className="text-center">
                          <p className="text-base font-semibold">{user.name}</p>
                          <p className="text-xs text-zinc-500">
                            {user.isAdmin ? "Admin" : "Coach"}
                          </p>
                        </div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                        <button
                          type="button"
                          disabled={avatarBusy}
                          onClick={() => avatarInputRef.current?.click()}
                          className="text-xs text-zinc-400 hover:text-zinc-200 transition border border-zinc-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                        >
                          {avatarBusy
                            ? "Uploading..."
                            : user.avatarUrl
                              ? "Change Photo"
                              : "Upload Photo"}
                        </button>
                      </div>

                      <div className="flex justify-center pt-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={signOut}
                          className="text-sm rounded-lg border border-zinc-700 px-6 py-2 hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {busy ? "Signing out..." : "Sign Out"}
                        </button>
                      </div>

                      {user.isAdmin ? (
                        <div className="flex justify-center">
                          <Link
                            href="/admin"
                            onClick={() => {
                              setOpen(false);
                              onNavigate?.();
                            }}
                            className="text-sm text-brand-gold hover:text-brand-gold/80"
                          >
                            Open Admin Dashboard
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-zinc-400">
                        {requiresRegistration
                          ? "Register this email for local login"
                          : "Sign in with your local account"}
                      </p>

                      <form onSubmit={submitLocalAuth} className="space-y-3">
                        <input
                          type="email"
                          autoComplete="email"
                          placeholder="Email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                          required
                        />
                        <input
                          type="password"
                          autoComplete={
                            requiresRegistration
                              ? "new-password"
                              : "current-password"
                          }
                          placeholder="Password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                          required
                          minLength={8}
                        />
                        {requiresRegistration ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                              type="text"
                              autoComplete="given-name"
                              placeholder="First name"
                              value={firstName}
                              onChange={(event) =>
                                setFirstName(event.target.value)
                              }
                              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                            />
                            <input
                              type="text"
                              autoComplete="family-name"
                              placeholder="Last name"
                              value={lastName}
                              onChange={(event) =>
                                setLastName(event.target.value)
                              }
                              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                            />
                          </div>
                        ) : null}
                        <button
                          type="submit"
                          disabled={busy}
                          className="w-full text-sm rounded-lg border border-zinc-700 px-3 py-2 hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {busy
                            ? "Working..."
                            : requiresRegistration
                              ? "Register"
                              : "Sign In"}
                        </button>
                      </form>

                      <div className="pt-3 border-t border-zinc-800 space-y-2">
                        <p className="text-xs text-zinc-500">
                          or continue with Google
                        </p>
                        {busy ? (
                          <p className="text-xs text-zinc-500">Signing in...</p>
                        ) : (
                          <div ref={googleButtonRef} />
                        )}
                      </div>
                    </div>
                  )}

                  {notice ? (
                    <p className="text-sm text-emerald-400 mt-3">{notice}</p>
                  ) : null}
                  {error ? (
                    <p className="text-sm text-red-400 mt-3">{error}</p>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
