"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  ACCOUNT_SETUP_PREFILL_KEY,
  type AccountSetupPrefillPayload,
} from "@/lib/accountSetupPrefill";

type LocalAuthResponse = {
  error?: string;
  isCoach?: boolean;
  isAdmin?: boolean;
};

type SetupContextResponse = {
  isCoach: boolean;
  organizationId: string | null;
  profile: {
    firstName?: string;
    lastName?: string;
    contactPhone?: string;
    ageGroup?: string;
    assignedTeam?: string;
  } | null;
};

type HierarchyResponse = {
  seasonYear: number;
  organizations: { id: string; displayName: string; shortName: string }[];
  tree: Record<string, Record<string, string[]>>;
};

function getPostLoginHref(response: LocalAuthResponse): string {
  return response.isCoach ? "/dugout" : "/";
}

function pickOrgLeagueTeam(
  hierarchy: HierarchyResponse,
  preferredOrg: string | null,
  preferredLeague: string,
  preferredTeam: string,
): { org: string; league: string; team: string } {
  const orgs = hierarchy.organizations.map((o) => o.id);
  const org =
    preferredOrg && hierarchy.tree[preferredOrg]
      ? preferredOrg
      : orgs.find((id) => hierarchy.tree[id]) || orgs[0] || "";

  const leagues = Object.keys(hierarchy.tree[org] || {}).sort();
  const league =
    preferredLeague && leagues.includes(preferredLeague)
      ? preferredLeague
      : leagues[0] || "";

  const teams = hierarchy.tree[org]?.[league] || [];
  const team =
    preferredTeam && teams.includes(preferredTeam)
      ? preferredTeam
      : teams[0] || "";

  return { org, league, team };
}

export default function AccountSetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [contextLoaded, setContextLoaded] = useState(false);
  const [isCoachUser, setIsCoachUser] = useState(false);
  const [userOrganizationId, setUserOrganizationId] = useState<string | null>(
    null,
  );

  const [hierarchy, setHierarchy] = useState<HierarchyResponse | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState("");

  const [coachOrgId, setCoachOrgId] = useState("");
  const [coachLeagueKey, setCoachLeagueKey] = useState("");
  const [coachTeamName, setCoachTeamName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    let nextEmail = params.get("email")?.trim() ?? "";
    let nextPassword = "";
    let nextFirstName = params.get("firstName")?.trim() ?? "";
    let nextLastName = params.get("lastName")?.trim() ?? "";
    let nextContactPhone = params.get("contactPhone")?.trim() ?? "";
    let seedAgeGroup = "";
    let seedTeam = "";

    try {
      const raw = sessionStorage.getItem(ACCOUNT_SETUP_PREFILL_KEY);
      if (raw) {
        sessionStorage.removeItem(ACCOUNT_SETUP_PREFILL_KEY);
        const parsed = JSON.parse(raw) as AccountSetupPrefillPayload;
        if (typeof parsed.email === "string" && parsed.email.trim()) {
          nextEmail = parsed.email.trim().toLowerCase();
        }
        if (typeof parsed.password === "string") {
          nextPassword = parsed.password;
        }
        if (parsed.setupProfile) {
          const sp = parsed.setupProfile;
          if (sp.firstName?.trim()) nextFirstName = sp.firstName.trim();
          if (sp.lastName?.trim()) nextLastName = sp.lastName.trim();
          if (sp.contactPhone?.trim()) nextContactPhone = sp.contactPhone.trim();
          if (sp.ageGroup?.trim()) seedAgeGroup = sp.ageGroup.trim();
          if (sp.assignedTeam?.trim()) seedTeam = sp.assignedTeam.trim();
        }
      }
    } catch {
      // ignore malformed prefill payload
    }

    const emailForHydrate = nextEmail.trim();

    queueMicrotask(() => {
      if (cancelled) return;
      setEmail(nextEmail);
      setPassword(nextPassword);
      setFirstName(nextFirstName);
      setLastName(nextLastName);
      setContactPhone(nextContactPhone);

      if (!emailForHydrate) {
        setContextLoaded(true);
        return;
      }

      void (async () => {
        try {
          const response = await fetch("/api/dugout/account-setup-context", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailForHydrate }),
          });
          if (!response.ok || cancelled) {
            if (!cancelled) setContextLoaded(true);
            return;
          }
          const data = (await response.json()) as SetupContextResponse;
          if (cancelled) return;

          setIsCoachUser(Boolean(data.isCoach));
          setUserOrganizationId(data.organizationId);

          if (data.profile) {
            const profile = data.profile;
            setFirstName((prev) => profile.firstName?.trim() || prev);
            setLastName((prev) => profile.lastName?.trim() || prev);
            setContactPhone((prev) => profile.contactPhone?.trim() || prev);
          }

          if (!data.isCoach) {
            setContextLoaded(true);
            return;
          }

          setHierarchyLoading(true);
          setHierarchyError("");
          const hRes = await fetch("/api/dugout/setup-team-hierarchy");
          if (!hRes.ok || cancelled) {
            if (!cancelled) {
              setHierarchyError("Could not load leagues and teams.");
              setHierarchyLoading(false);
              setContextLoaded(true);
            }
            return;
          }
          const h = (await hRes.json()) as HierarchyResponse;
          if (cancelled) return;

          setHierarchy(h);

          const preferredLeague =
            data.profile?.ageGroup?.trim() || seedAgeGroup;
          const preferredTeam = data.profile?.assignedTeam?.trim() || seedTeam;

          const preferredOrg =
            data.organizationId &&
            h.tree[data.organizationId] &&
            h.organizations.some((o) => o.id === data.organizationId)
              ? data.organizationId
              : null;

          const picked = pickOrgLeagueTeam(
            h,
            preferredOrg,
            preferredLeague,
            preferredTeam,
          );
          setCoachOrgId(picked.org);
          setCoachLeagueKey(picked.league);
          setCoachTeamName(picked.team);
        } catch {
          if (!cancelled) setHierarchyError("Could not load setup data.");
        } finally {
          if (!cancelled) {
            setHierarchyLoading(false);
            setContextLoaded(true);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const organizationOptions = useMemo(() => {
    if (!hierarchy) return [];
    const { organizations } = hierarchy;
    if (
      userOrganizationId &&
      organizations.some((o) => o.id === userOrganizationId)
    ) {
      return organizations.filter((o) => o.id === userOrganizationId);
    }
    return organizations;
  }, [hierarchy, userOrganizationId]);

  const leagueOptions = useMemo(() => {
    if (!hierarchy || !coachOrgId) return [];
    return Object.keys(hierarchy.tree[coachOrgId] || {}).sort();
  }, [hierarchy, coachOrgId]);

  const teamOptions = useMemo(() => {
    if (!hierarchy || !coachOrgId || !coachLeagueKey) return [];
    return hierarchy.tree[coachOrgId]?.[coachLeagueKey] ?? [];
  }, [hierarchy, coachOrgId, coachLeagueKey]);

  const coachSelectionsReady =
    Boolean(coachOrgId) && Boolean(coachLeagueKey) && Boolean(coachTeamName);

  const canSubmit = useMemo(() => {
    if (!email.trim() || password.length < 8 || busy) return false;
    if (!contextLoaded) return false;
    if (isCoachUser) {
      if (hierarchyLoading || hierarchyError) return false;
      if (!hierarchy) return false;
      return coachSelectionsReady;
    }
    return true;
  }, [
    busy,
    email,
    password,
    contextLoaded,
    isCoachUser,
    hierarchyLoading,
    hierarchyError,
    hierarchy,
    coachSelectionsReady,
  ]);

  function onCoachOrgChange(nextOrg: string) {
    if (!hierarchy) return;
    setCoachOrgId(nextOrg);
    const leagues = Object.keys(hierarchy.tree[nextOrg] || {}).sort();
    const league = leagues[0] || "";
    setCoachLeagueKey(league);
    setCoachTeamName(hierarchy.tree[nextOrg]?.[league]?.[0] || "");
  }

  function onCoachLeagueChange(nextLeague: string) {
    if (!hierarchy || !coachOrgId) return;
    setCoachLeagueKey(nextLeague);
    setCoachTeamName(hierarchy.tree[coachOrgId]?.[nextLeague]?.[0] || "");
  }

  async function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload: Record<string, unknown> = {
        mode: "signup",
        email,
        password,
        firstName,
        lastName,
        contactPhone,
      };
      if (isCoachUser) {
        payload.ageGroup = coachLeagueKey;
        payload.assignedTeam = coachTeamName;
      }

      const response = await fetch("/api/dugout/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as LocalAuthResponse;
      if (!response.ok) {
        throw new Error(
          (json as { error?: string }).error || "Failed to complete setup",
        );
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

  const title = !contextLoaded
    ? "Complete account setup"
    : isCoachUser
      ? "Finish coach account setup"
      : "Complete account setup";
  const subtitle = !contextLoaded
    ? "Loading your account details…"
    : isCoachUser
      ? "Create your password and confirm your profile. Choose your organization, age division (league), and team from the lists below—they match this season’s roster data."
      : "We’ve filled in what we already have on file. Edit anything that needs updating, then create your password below if you have not set one yet.";

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14 px-6">
      <section className="max-w-xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>
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

          {isCoachUser && contextLoaded ? (
            <div className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-950/40 p-3">
              <p className="text-xs text-zinc-400">
                Age division and team (coach registration only)
              </p>
              {hierarchyLoading ? (
                <p className="text-sm text-zinc-300">Loading leagues and teams…</p>
              ) : null}
              {hierarchyError ? (
                <p className="text-sm text-amber-300">{hierarchyError}</p>
              ) : null}
              {hierarchy && !hierarchyLoading ? (
                <>
                  <label className="block text-xs font-medium text-zinc-400">
                    Organization
                    <select
                      value={coachOrgId}
                      onChange={(e) => onCoachOrgChange(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                    >
                      {organizationOptions.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-zinc-400">
                    Age group (league)
                    <select
                      value={coachLeagueKey}
                      onChange={(e) => onCoachLeagueChange(e.target.value)}
                      disabled={!leagueOptions.length}
                      className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {leagueOptions.map((league) => (
                        <option key={league} value={league}>
                          {league}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-zinc-400">
                    Team
                    <select
                      value={coachTeamName}
                      onChange={(e) => setCoachTeamName(e.target.value)}
                      disabled={!teamOptions.length}
                      className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {teamOptions.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!leagueOptions.length ? (
                    <p className="text-xs text-zinc-500">
                      No teams are listed for this organization in the current season
                      ({hierarchy.seasonYear}). Contact your league administrator if this
                      looks wrong.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

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
