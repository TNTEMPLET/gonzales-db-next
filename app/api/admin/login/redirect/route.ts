import { NextRequest, NextResponse } from "next/server";

import { applyAdminLoginCookies } from "@/lib/auth/applyAdminLoginCookies";
import { verifyAdminCredentials } from "@/lib/auth/adminSession";
import { withTransientDbRetry } from "@/lib/prismaRetry";
import { requestPublicUrl } from "@/lib/requestPublicUrl";

function safeNextPath(value: string | null | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/admin";
}

function loginUrl(request: NextRequest, params: Record<string, string>) {
  const url = requestPublicUrl(request, "/admin/login");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(String(formData.get("next") ?? "/admin"));

  if (!email || !password) {
    return NextResponse.redirect(
      loginUrl(request, { error: "missing", next: nextPath }),
      303,
    );
  }

  try {
    const adminUser = await withTransientDbRetry(() =>
      verifyAdminCredentials(email, password),
    );

    if (!adminUser) {
      return NextResponse.redirect(
        loginUrl(request, { error: "invalid", next: nextPath }),
        303,
      );
    }

    const response = NextResponse.redirect(requestPublicUrl(request, nextPath), 303);
    await applyAdminLoginCookies(response, {
      id: adminUser.id,
      email: adminUser.email,
    });
    return response;
  } catch (err: unknown) {
    console.error("Admin login redirect failed:", err);
    return NextResponse.redirect(
      loginUrl(request, { error: "server", next: nextPath }),
      303,
    );
  }
}
