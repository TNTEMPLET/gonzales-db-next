import type { NextRequest } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";

export async function isCoach(request: NextRequest): Promise<boolean> {
  const coachUser = await getCoachUserFromRequest(request);
  if (coachUser?.isCoach) return true;
  const adminUser = await getAdminUserFromRequest(request);
  return Boolean(adminUser);
}

export async function ensureCoach(request: NextRequest): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  if (!(await isCoach(request))) {
    return {
      ok: false,
      status: 401,
      message: "Coach access required",
    };
  }

  return { ok: true, status: 200 };
}
