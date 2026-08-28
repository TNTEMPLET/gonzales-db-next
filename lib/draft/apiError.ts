import { NextResponse } from "next/server";

/**
 * Consistent error response for draft API routes. Logs the real error
 * server-side (so it's still debuggable) but never leaks raw Prisma/JS
 * error internals (constraint names, stack details) to the client.
 */
export function draftApiError(
  context: string,
  error: unknown,
  status = 500
): NextResponse {
  console.error(`[draft:${context}]`, error);
  const message =
    status < 500 && error instanceof Error ? error.message : "Something went wrong. Please try again.";
  return NextResponse.json({ error: message }, { status });
}
