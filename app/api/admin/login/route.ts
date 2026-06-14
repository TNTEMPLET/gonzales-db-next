import { NextRequest, NextResponse } from "next/server";

import { applyAdminLoginCookies } from "@/lib/auth/applyAdminLoginCookies";
import { verifyAdminCredentials } from "@/lib/auth/adminSession";
import { withTransientDbRetry } from "@/lib/prismaRetry";

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

    const adminUser = await withTransientDbRetry(() =>
      verifyAdminCredentials(email, password),
    );
    if (!adminUser) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      success: true,
      user: { id: adminUser.id, email: adminUser.email, name: adminUser.name },
    });

    await applyAdminLoginCookies(response, {
      id: adminUser.id,
      email: adminUser.email,
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
