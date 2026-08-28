/** Extracts a display-safe message from a caught value of unknown shape. */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
