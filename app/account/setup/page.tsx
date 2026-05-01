"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type LocalAuthResponse = {
  error?: string;
  isCoach?: boolean;
  isAdmin?: boolean;
};

function getPostLoginHref(response: LocalAuthResponse): string {
  return response.isCoach ? "/dugout" : "/";
}

export default function AccountSetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length >= 8 && !busy,
    [busy, email, password],
  );

  useEffect(() => {
    const initialEmail = new URLSearchParams(window.location.search).get("email") || "";
    setEmail(initialEmail);
  }, []);

  async function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dugout/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "signup",
          email,
          password,
          firstName,
          lastName,
          contactPhone,
          ageGroup,
          assignedTeam,
        }),
      });
      const json = (await response.json()) as LocalAuthResponse;
      if (!response.ok) {
        throw new Error(json.error || "Failed to complete setup");
      }

      setNotice("Account setup complete. Redirecting…");
      router.push(getPostLoginHref(json));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to complete setup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14 px-6">
      <section className="max-w-xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Complete Account Setup</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Create your password and confirm your profile details before first login.
          </p>
        </div>

        {notice ? (
          <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <form onSubmit={submitSetup} className="space-y-3">
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
            autoComplete="new-password"
            placeholder="Create password (min 8 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            required
            minLength={8}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              autoComplete="given-name"
              placeholder="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
            <input
              type="text"
              autoComplete="family-name"
              placeholder="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
          </div>
          <input
            type="text"
            autoComplete="tel"
            placeholder="Contact phone"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Age group"
              value={ageGroup}
              onChange={(event) => setAgeGroup(event.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Assigned team"
              value={assignedTeam}
              onChange={(event) => setAssignedTeam(event.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Saving..." : "Complete Setup"}
          </button>
        </form>

        <p className="text-xs text-zinc-500">
          Already completed setup?{" "}
          <Link href="/" className="text-brand-gold hover:text-brand-gold/80">
            Return home and sign in
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
