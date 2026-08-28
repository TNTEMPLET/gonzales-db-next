import type { TripAnswers, TripFieldDefPublic, TripPrefillSource } from "@/lib/trip/types";

export function parseAnswersJson(raw: string | null | undefined): TripAnswers {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as TripAnswers;
  } catch {
    return {};
  }
}

/** Split "First Last" / "First Middle Last" into first + last. */
export function splitPlayerName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function prefillValue(
  source: TripPrefillSource,
  participant: {
    playerFullName: string;
    ageGroup: string | null;
    team: string | null;
    jerseyNumber: string | null;
  },
): string | null {
  switch (source) {
    case "playerFullName":
      return participant.playerFullName.trim() || null;
    case "playerFirstName":
      return splitPlayerName(participant.playerFullName).first || null;
    case "playerLastName":
      return splitPlayerName(participant.playerFullName).last || null;
    case "ageGroup":
      return participant.ageGroup?.trim() || null;
    case "team":
      return participant.team?.trim() || null;
    case "jerseyNumber":
      return participant.jerseyNumber?.trim() || null;
    default:
      return null;
  }
}

export function buildPrefillAnswers(
  fields: TripFieldDefPublic[],
  participant: {
    playerFullName: string;
    ageGroup: string | null;
    team: string | null;
    jerseyNumber: string | null;
  },
): TripAnswers {
  const out: TripAnswers = {};
  for (const f of fields) {
    if (!f.prefillFrom) continue;
    const v = prefillValue(f.prefillFrom, participant);
    if (v != null && String(v).trim()) out[f.key] = String(v).trim();
  }
  // Default participant type for roster athletes
  if (!out.participant_type) {
    const typeField = fields.find((f) => f.key === "participant_type");
    if (typeField) out.participant_type = "Player";
  }
  return out;
}

export function validateTripAnswers(
  fields: TripFieldDefPublic[],
  answers: TripAnswers,
  opts?: { parentFacing?: boolean },
): { ok: true; answers: TripAnswers } | { ok: false; errors: string[] } {
  const parentFacing = opts?.parentFacing !== false;
  const errors: string[] = [];
  const cleaned: TripAnswers = {};

  const visible = fields.filter((f) => (parentFacing ? !f.adminOnly : true));

  for (const f of visible) {
    const raw = answers[f.key];
    if (f.fieldType === "checkbox") {
      const bool = raw === true || raw === "true" || raw === "Yes" || raw === 1;
      cleaned[f.key] = bool;
      if (f.required && !bool) errors.push(`${f.label} is required.`);
      continue;
    }

    if (raw === undefined || raw === null || String(raw).trim() === "") {
      cleaned[f.key] = f.fieldType === "number" ? null : "";
      if (f.required && f.fieldType !== "readonly") {
        errors.push(`${f.label} is required.`);
      }
      continue;
    }

    if (f.fieldType === "number") {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) {
        errors.push(`${f.label} must be a number.`);
        cleaned[f.key] = null;
      } else {
        cleaned[f.key] = n;
      }
      continue;
    }

    const s = String(raw).trim();
    if (f.fieldType === "email" && s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      errors.push(`${f.label} must be a valid email.`);
    }
    if (f.fieldType === "select" && f.options.length > 0 && !f.options.includes(s)) {
      errors.push(`${f.label} must be one of: ${f.options.join(", ")}.`);
    }
    cleaned[f.key] = s;
  }

  // Preserve admin-only keys when not parent-facing full replace handled by caller
  if (!parentFacing) {
    for (const f of fields.filter((x) => x.adminOnly)) {
      if (answers[f.key] !== undefined) cleaned[f.key] = answers[f.key] ?? "";
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, answers: cleaned };
}
