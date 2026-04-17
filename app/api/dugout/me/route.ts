import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const coachUser = await getCoachUserFromRequest(request);
  const adminUser = await getAdminUserFromRequest(request);
  if (adminUser) {
    const name =
      [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ") ||
      adminUser.name ||
      adminUser.email;
    return NextResponse.json(
      {
        user: {
          name,
          firstName: adminUser.firstName ?? null,
          avatarUrl: adminUser.avatarUrl ?? null,
          isCoach: true,
          isAdmin: true,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (coachUser) {
    const name =
      [coachUser.firstName, coachUser.lastName].filter(Boolean).join(" ") ||
      coachUser.name ||
      coachUser.email;
    return NextResponse.json(
      {
        user: {
          name,
          firstName: coachUser.firstName ?? null,
          avatarUrl: coachUser.avatarUrl ?? null,
          isCoach: Boolean(coachUser.isCoach),
          isAdmin: false,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  return NextResponse.json(
    { user: null },
    {
      status: 401,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
