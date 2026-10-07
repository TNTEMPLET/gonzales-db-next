import { SCOUT_MAILBOX } from "@/lib/scout/config";

export function isScoutOperator(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SCOUT_MAILBOX;
}

/** Page gate. Other deployments and other admins get a 404. Missing session goes to login. */
export function scoutPageAccess(input: {
  masterDeployment: boolean;
  email: string | null;
}): "allow" | "login" | "not_found" {
  if (!input.masterDeployment) return "not_found";
  if (!input.email) return "login";
  if (!isScoutOperator(input.email)) return "not_found";
  return "allow";
}

/** API gate. Non-master deployments are 404. Signed-in non-operators are 403. */
export function scoutApiAccess(input: {
  masterDeployment: boolean;
  email: string | null;
}): { ok: true } | { ok: false; status: 401 | 403 | 404 } {
  if (!input.masterDeployment) return { ok: false, status: 404 };
  if (!input.email) return { ok: false, status: 401 };
  if (!isScoutOperator(input.email)) return { ok: false, status: 403 };
  return { ok: true };
}
