import { NextResponse } from "next/server";

/** Standard JSON error envelope for admin APIs. */
export function jsonError(
  error: string,
  status: number,
  extra?: { issues?: string[]; hint?: string },
) {
  return NextResponse.json(
    {
      error,
      ...(extra?.issues ? { issues: extra.issues } : {}),
      ...(extra?.hint ? { hint: extra.hint } : {}),
    },
    { status },
  );
}

export function jsonOk<T extends Record<string, unknown>>(
  body: T,
  init?: { status?: number },
) {
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

/** Map ensureAdminModule / EnsureAdminResult failure to JSON. */
export function authFailureResponse(auth: {
  ok: false;
  status: number;
  message?: string;
}) {
  return jsonError(auth.message || "Unauthorized", auth.status);
}
