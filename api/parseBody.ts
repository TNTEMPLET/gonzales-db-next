import { ZodError, type ZodType } from "zod";

/**
 * Parse and validate a JSON body with Zod.
 * Use at API route trust boundaries (Phase 3 / ADR-004).
 */
export function parseBody<T>(schema: ZodType<T>, data: unknown):
  | { ok: true; data: T }
  | { ok: false; error: string; issues?: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const issues = result.error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
  );
  return {
    ok: false,
    error: issues[0] || "Invalid request body",
    issues,
  };
}

export function zodErrorMessage(err: unknown, fallback = "Validation failed"): string {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    if (first) {
      const path = first.path.join(".");
      return path ? `${path}: ${first.message}` : first.message;
    }
  }
  return fallback;
}
