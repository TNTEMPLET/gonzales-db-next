import type { NextRequest } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";

export async function isNewsAdmin(request: NextRequest): Promise<boolean> {
  const adminUser = await getAdminUserFromRequest(request);
  return Boolean(adminUser);
}

export async function ensureNewsAdmin(request: NextRequest): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  if (!(await isNewsAdmin(request))) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized",
    };
  }

  return { ok: true, status: 200 };
}
