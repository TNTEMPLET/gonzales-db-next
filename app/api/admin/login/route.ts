import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  verifyAdminCredentials,
} from "@/lib/auth/adminSession";

type LoginPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginPayload;
    const email = body.email?.trim();
    const password = body.password || "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 },
      );
    }

    const adminUser = await verifyAdminCredentials(email, password);
    if (!adminUser) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const session = await createAdminSession(adminUser.id);

    const response = NextResponse.json({
      success: true,
      user: { id: adminUser.id, email: adminUser.email, name: adminUser.name },
    });

    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Login failed: ${message}` },
      { status: 500 },
    );
  }
}
