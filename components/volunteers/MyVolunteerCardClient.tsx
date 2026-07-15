"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";
import { formatOrganizationIdDisplay } from "@/lib/siteConfig";
import type { AccessBadgeEligibility } from "@/lib/volunteers/accessBadge";
import {
  READINESS_LABELS,
  type VolunteerCardView,
  type VolunteerReadiness,
  type VolunteerRequirementStatusValue,
} from "@/lib/volunteers/types";

const READINESS_STYLES: Record<VolunteerReadiness, string> = {
  READY: "border-emerald-600/70 bg-emerald-950/50 text-emerald-100",
  INCOMPLETE: "border-amber-600/70 bg-amber-950/40 text-amber-100",
  EXPIRED: "border-orange-600/70 bg-orange-950/40 text-orange-100",
  BLOCKED: "border-red-600/70 bg-red-950/50 text-red-100",
};

const REQ_STYLES: Record<VolunteerRequirementStatusValue, string> = {
  CLEAR: "text-emerald-300",
  WAIVED: "text-sky-300",
  PENDING: "text-amber-300",
  NOT_STARTED: "text-zinc-400",
  EXPIRED: "text-orange-300",
  FAILED: "text-red-300",
};

function displayName(card: VolunteerCardView) {
  const parts = [card.registeredUser.firstName, card.registeredUser.lastName]
    .filter(Boolean)
    .join(" ");
  return parts || card.registeredUser.name || card.registeredUser.email;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

type ApiResponse = {
  data: VolunteerCardView | null;
  accessBadge: AccessBadgeEligibility | null;
  canToggleA?: boolean;
  message?: string;
  error?: string;
};

export default function MyVolunteerCardClient({
  targetOrg,
}: {
  targetOrg: ContentOrgId;
}) {
  const [card, setCard] = useState<VolunteerCardView | null>(null);
  const [accessBadge, setAccessBadge] = useState<AccessBadgeEligibility | null>(
    null,
  );
  const [canToggleA, setCanToggleA] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [aBusy, setABusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/volunteer-card?org=${encodeURIComponent(targetOrg)}`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as ApiResponse;
      if (response.status === 401) {
        setError("Sign in with your coach/volunteer account to view your card.");
        setCard(null);
        setAccessBadge(null);
        setCanToggleA(false);
        return;
      }
      if (!response.ok) {
        throw new Error(json.error || "Failed to load volunteer card");
      }
      setCard(json.data);
      setAccessBadge(json.accessBadge);
      setCanToggleA(Boolean(json.canToggleA));
      setMessage(json.message || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setCard(null);
      setAccessBadge(null);
      setCanToggleA(false);
    } finally {
      setBusy(false);
    }
  }, [targetOrg]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleAMark() {
    if (!card || !canToggleA || aBusy) return;
    setABusy(true);
    try {
      const response = await fetch(
        `/api/volunteer-card?org=${encodeURIComponent(targetOrg)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aMark: !card.aMark }),
        },
      );
      const json = (await response.json()) as ApiResponse;
      if (!response.ok) {
        throw new Error(json.error || "Update failed");
      }
      if (json.data) {
        setCard(json.data);
        setAccessBadge(json.accessBadge);
      }
    } catch {
      // Silent — no user-facing clue about the control.
    } finally {
      setABusy(false);
    }
  }

  if (busy) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
        Loading your volunteer card…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-2xl border border-amber-900/50 bg-amber-950/20 p-6">
        <p className="text-sm text-amber-100">{error}</p>
        <p className="text-xs text-zinc-400">
          Use Login in the header (same account as Coach&apos;s Corner / Dugout).
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-300">
        <p>{message || "No volunteer card found for this season."}</p>
        <p className="mt-3 text-xs text-zinc-500">
          League admins create and maintain compliance cards. If you coach or
          volunteer and expected a card, contact your park director.
        </p>
        <Link
          href="/coach-corner"
          className="mt-4 inline-flex text-sm font-semibold text-brand-gold hover:text-brand-gold/80"
        >
          Open Coach&apos;s Corner →
        </Link>
      </div>
    );
  }

  const aActive = Boolean(card.aMark);

  return (
    <div className="space-y-6">
      <article
        className="relative overflow-hidden rounded-3xl border border-zinc-700 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        data-badge-subject={accessBadge?.publicBadgeSubject}
        data-access-eligible={accessBadge?.eligibleForEventAccess ? "1" : "0"}
        data-a={aActive ? "1" : "0"}
      >
        <div className="border-b border-zinc-800 bg-brand-purple/20 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-gold">
                Volunteer card
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {displayName(card)}
              </h2>
              <p className="mt-1 text-sm text-zinc-300">
                {formatOrganizationIdDisplay(card.organizationId)} · Season{" "}
                {card.seasonYear}
              </p>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${READINESS_STYLES[card.readiness]}`}
            >
              {READINESS_LABELS[card.readiness]}
            </span>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 pb-10 sm:px-6 sm:py-6 sm:pb-11">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                Roles
              </p>
              <p className="mt-1 text-sm text-zinc-100">
                {card.roles.length
                  ? card.roles.map((r) => r.label || r.roleKey).join(", ")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                Teams
              </p>
              <p className="mt-1 text-sm text-zinc-100">
                {card.teamAssignments.length
                  ? card.teamAssignments
                      .map((t) => `${t.team.ageGroup} ${t.team.teamName}`)
                      .join(", ")
                  : card.registeredUser.assignedTeam || "—"}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
              Compliance
            </p>
            <ul className="space-y-2">
              {card.requirements.map((req) => (
                <li
                  key={req.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{req.label}</p>
                    {req.expiresAt ? (
                      <p className="text-xs text-zinc-500">
                        Expires{" "}
                        {new Date(req.expiresAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    ) : null}
                    {req.key === "ABUSE_AWARENESS" && req.documentUrl ? (
                      <a
                        href={req.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sky-300 hover:underline"
                      >
                        View certificate
                      </a>
                    ) : null}
                  </div>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wide ${REQ_STYLES[req.status]}`}
                  >
                    {statusLabel(req.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`rounded-xl border px-3 py-3 text-sm ${
              accessBadge?.eligibleForEventAccess
                ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-100"
                : "border-zinc-700 bg-zinc-900/80 text-zinc-300"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Event access badges
            </p>
            <p className="mt-1">
              {accessBadge?.reason ||
                "Access badge eligibility will appear when your card loads."}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Later, READY cards can be issued as scan-ready access badges for
              tournaments and events. Your compliance status is the source of
              truth.
            </p>
          </div>
        </div>

        {/* Bottom-right opaque mark: hole with "A". Toggle only for Master Admin. */}
        {canToggleA ? (
          <button
            type="button"
            onClick={() => void toggleAMark()}
            disabled={aBusy}
            aria-pressed={aActive}
            className={`absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold leading-none transition focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 disabled:opacity-60 ${
              aActive
                ? "border-zinc-500/80 bg-zinc-950 text-zinc-200 shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)]"
                : "border-zinc-700/70 bg-zinc-900/90 text-zinc-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.7)] hover:border-zinc-600 hover:text-zinc-400"
            }`}
          >
            A
          </button>
        ) : aActive ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-950 text-[11px] font-semibold leading-none text-zinc-200 shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)]"
          >
            A
          </span>
        ) : null}
      </article>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/coach-corner"
          className="inline-flex min-h-11 items-center rounded-xl border border-zinc-700 px-4 font-semibold text-zinc-100 hover:border-zinc-500"
        >
          Coach&apos;s Corner
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-11 items-center rounded-xl bg-brand-purple px-4 font-semibold text-white hover:bg-brand-purple-dark"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
