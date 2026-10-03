export const RAINOUT_TABLE_MISSING_MESSAGE =
  "Rainout notification table missing; migrations pending";

export class RainoutTableMissingError extends Error {
  constructor() {
    super(RAINOUT_TABLE_MISSING_MESSAGE);
    this.name = "RainoutTableMissingError";
  }
}

export function isMissingRainoutTableError(error: unknown): boolean {
  if (error instanceof RainoutTableMissingError) return true;
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code?: unknown }).code);
  return code === "P2021" || code === "P2022";
}

export function warnMissingRainoutTable(): void {
  console.warn("[rainout] RainoutParkNotification table missing; migrations pending");
}

export function rainoutFailureMessage(error: unknown, fallback: string): string {
  if (isMissingRainoutTableError(error)) {
    if (!(error instanceof RainoutTableMissingError)) warnMissingRainoutTable();
    return RAINOUT_TABLE_MISSING_MESSAGE;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
