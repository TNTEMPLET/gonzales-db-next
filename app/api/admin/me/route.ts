import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";

export async function GET(request: NextRequest) {
  try {
    const adminUser = await getAdminUserFromRequest(request);
    if (!adminUser) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: adminUser,
    });
  } catch (err) {
    console.error("[api/admin/me] auth check failed:", err);
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
