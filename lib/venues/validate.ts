import { normalizeVenueName } from "@/lib/venues/match";

const LIMITS = {
  name: 120,
  shortName: 40,
  address: 240,
  notes: 2000,
} as const;

export type VenueWriteInput = {
  name: string;
  shortName: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  normalizedName: string;
};

export function parseVenueWrite(
  body: unknown,
): { ok: true; value: VenueWriteInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Enter the shared park details." };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.name !== "string" || !record.name.trim()) {
    return { ok: false, error: "Enter a park name." };
  }
  const name = record.name.trim();
  if (name.length > LIMITS.name) {
    return { ok: false, error: `Name must be ${LIMITS.name} characters or fewer.` };
  }
  const normalizedName = normalizeVenueName(name);
  if (!normalizedName) {
    return { ok: false, error: "Enter a park name with letters or numbers." };
  }

  const shortName = optionalText(record.shortName, "Short name", LIMITS.shortName);
  if (!shortName.ok) return shortName;
  const address = optionalText(record.address, "Address", LIMITS.address);
  if (!address.ok) return address;
  const notes = optionalText(record.notes, "Notes", LIMITS.notes);
  if (!notes.ok) return notes;

  if (record.isActive != null && typeof record.isActive !== "boolean") {
    return { ok: false, error: "Active must be yes or no." };
  }

  return {
    ok: true,
    value: {
      name,
      shortName: shortName.value,
      address: address.value,
      notes: notes.value,
      isActive: record.isActive !== false,
      normalizedName,
    },
  };
}

export function parseVenueLink(
  body: unknown,
):
  | { ok: true; scheduleParkId: string; venueId: string | null }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Choose a shared park." };
  }
  const record = body as Record<string, unknown>;
  if (typeof record.scheduleParkId !== "string" || !record.scheduleParkId.trim()) {
    return { ok: false, error: "Choose a league park." };
  }
  if (record.venueId != null && typeof record.venueId !== "string") {
    return { ok: false, error: "Choose a shared park." };
  }
  const venueId = typeof record.venueId === "string" ? record.venueId.trim() : "";
  return {
    ok: true,
    scheduleParkId: record.scheduleParkId.trim(),
    venueId: venueId || null,
  };
}

export function parseSuggestionConfirm(
  body: unknown,
): { ok: true; parkId: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Choose a suggestion to confirm." };
  }
  const parkId = (body as Record<string, unknown>).parkId;
  if (typeof parkId !== "string" || !parkId.trim()) {
    return { ok: false, error: "Choose a suggestion to confirm." };
  }
  return { ok: true, parkId: parkId.trim() };
}

function optionalText(
  value: unknown,
  field: string,
  max: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be text.` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: `${field} must be ${max} characters or fewer.` };
  }
  return { ok: true, value: trimmed };
}
