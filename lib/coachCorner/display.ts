/** Coach Corner display helpers (Phase 7). */

export type CoachNameFields = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
};

export function coachDisplayName(coach: CoachNameFields) {
  const fromParts = [coach.firstName, coach.lastName].filter(Boolean).join(" ").trim();
  return fromParts || coach.name?.trim() || coach.email?.trim() || "Coach";
}

export function formatUploadedAt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}
