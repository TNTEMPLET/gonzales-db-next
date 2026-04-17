import { NextRequest, NextResponse } from "next/server";

import {
  clearCoachSessionByToken,
  COACH_SESSION_COOKIE,
} from "@/lib/auth/coachSession";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COACH_SESSION_COOKIE)?.value;
  await clearCoachSessionByToken(token);

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: COACH_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
