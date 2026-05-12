import { NextRequest, NextResponse } from "next/server";

import { getAssignrOAuthScope } from "@/lib/assignr/config";
import { getAssignrAccessToken } from "@/lib/assignr/client";
import { ensureAdminModule } from "@/lib/news/auth";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "ASSIGNR");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const clientId = process.env.ASSIGNR_CLIENT_ID;
  const clientSecret = process.env.ASSIGNR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Missing Assignr credentials in environment variables" },
      { status: 500 },
    );
  }

  try {
    const accessToken = await getAssignrAccessToken();
    return NextResponse.json({
      access_token: accessToken,
      scope: getAssignrOAuthScope(),
      token_type: "Bearer",
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}
