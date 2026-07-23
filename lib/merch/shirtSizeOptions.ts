/**
 * Structured size choices for the merch test-order form (and a future
 * on-site checkout). Labels match what shirt-orders parsing already accepts
 * via normalizeSizeLabel / expandSizeLabels.
 */

export type ShirtSizeOption = {
  /** Canonical short label stored in the joined note (e.g. YM, AL). */
  value: string;
  /** Human label on the form. */
  label: string;
  group: "youth" | "adult";
};

export const SHIRT_SIZE_OPTIONS: ShirtSizeOption[] = [
  { value: "YXS", label: "Youth XS", group: "youth" },
  { value: "YS", label: "Youth Small", group: "youth" },
  { value: "YM", label: "Youth Medium", group: "youth" },
  { value: "YL", label: "Youth Large", group: "youth" },
  { value: "YXL", label: "Youth XL", group: "youth" },
  { value: "AS", label: "Adult Small", group: "adult" },
  { value: "AM", label: "Adult Medium", group: "adult" },
  { value: "AL", label: "Adult Large", group: "adult" },
  { value: "AXL", label: "Adult XL", group: "adult" },
  { value: "AXXL", label: "Adult 2XL", group: "adult" },
];

/** Build the PayPal-style joined note: `Player Name | YS, YM, AL`. */
export function buildShirtCheckoutNote(playerName: string, sizes: string[]): string {
  const player = playerName.trim().replace(/\s+/g, " ");
  const cleanSizes = sizes.map((s) => s.trim()).filter(Boolean);
  const sizePart = cleanSizes.join(", ");
  if (player && sizePart) return `${player} | ${sizePart}`;
  if (player) return player;
  return sizePart;
}

/** One line per shirt — alternate PayPal note style some parents use. */
export function buildShirtCheckoutNoteMultiline(playerName: string, sizes: string[]): string {
  const player = playerName.trim().replace(/\s+/g, " ");
  const lines = sizes.map((s) => s.trim()).filter(Boolean);
  if (player && lines.length) return `${player} | ${lines.join("\n")}`;
  if (player) return player;
  return lines.join("\n");
}
