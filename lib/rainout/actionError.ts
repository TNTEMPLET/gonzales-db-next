import { rainoutFailureMessage } from "./missingTable";

/** Redirects and notFound() throw. Callers that catch must rethrow those. */
export function rethrowNavigationError(error: unknown): void {
  if (!error || typeof error !== "object" || !("digest" in error)) return;
  const digest = String((error as { digest?: unknown }).digest ?? "");
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")) {
    throw error;
  }
}

export function rainoutActionError(error: unknown, fallback: string): string {
  rethrowNavigationError(error);
  return rainoutFailureMessage(error, fallback);
}
