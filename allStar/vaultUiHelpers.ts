/**
 * Pure helpers extracted from AllStarVaultManager for testability and Phase 3 splits.
 */

export type VaultEditModuleKey =
  | "cycle"
  | "candidates"
  | "coaches"
  | "submitted"
  | "votes"
  | "sample"
  | "access"
  | "invites";

export type VaultEditModuleVisibility = Record<VaultEditModuleKey, boolean>;

export type VaultModulePreset = "OPERATIONS" | "ROSTER" | "ACCESS";

export type VaultRunoffBuilderMode =
  | "DEFAULT_SECOND"
  | "LEFTOVER_AFTER_TOP"
  | "RUNOFF_TOP";

export function sortBallotRosterRowsByName<T extends { displayName: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
}

export function getVisibilityForLimitedVaultBallotToolkit(): VaultEditModuleVisibility {
  return {
    cycle: false,
    candidates: false,
    coaches: false,
    submitted: true,
    votes: true,
    sample: false,
    access: false,
    invites: true,
  };
}

export function getVisibilityForPreset(
  preset: VaultModulePreset,
): VaultEditModuleVisibility {
  if (preset === "ROSTER") {
    return {
      cycle: true,
      candidates: true,
      coaches: true,
      submitted: true,
      votes: true,
      sample: true,
      access: false,
      invites: false,
    };
  }
  if (preset === "ACCESS") {
    return {
      cycle: true,
      candidates: false,
      coaches: false,
      submitted: false,
      votes: false,
      sample: false,
      access: true,
      invites: true,
    };
  }
  return {
    cycle: true,
    candidates: true,
    coaches: false,
    submitted: false,
    votes: true,
    sample: false,
    access: false,
    invites: false,
  };
}

export function normalizeBallotEmail(email: string) {
  return email.trim().toLowerCase();
}

export function displayNameFromCoachFields(
  firstName: string | null,
  lastName: string | null,
  name: string | null,
  email: string,
) {
  const fromParts =
    firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(" ").trim()
      : "";
  const fromName = name?.trim() || "";
  return fromParts || fromName || email;
}

export function hasVisibleJerseyNumber(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return !["tbd", "n/a", "na"].includes(normalized);
}

export function buildRunoffBuilderTitle(
  cycle: { title?: string | null; ageGroup?: string | null; seasonYear?: number | null } | null,
  mode: VaultRunoffBuilderMode,
) {
  const base =
    cycle?.title?.trim() ||
    `${cycle?.ageGroup || "All-Stars"} ${cycle?.seasonYear || ""}`.trim();
  if (mode === "RUNOFF_TOP") return `${base} (Runoff)`;
  if (mode === "DEFAULT_SECOND") return `${base} (Second Team)`;
  return `${base} (Second Team Runoff)`;
}

export function getCycleStatusBadgeClass(status: string) {
  if (status === "PUBLISHED") {
    return "border-emerald-700 bg-emerald-950/40 text-emerald-200";
  }
  if (status === "CLOSED") {
    return "border-amber-700 bg-amber-950/40 text-amber-200";
  }
  if (status === "DRAFT") {
    return "border-sky-700 bg-sky-950/40 text-sky-200";
  }
  return "border-zinc-700 bg-zinc-950 text-zinc-300";
}
