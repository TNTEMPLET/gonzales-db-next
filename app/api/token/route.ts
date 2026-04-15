// app/api/token/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const clientId = process.env.ASSIGNR_CLIENT_ID;
  const clientSecret = process.env.ASSIGNR_CLIENT_SECRET;
  const baseUrl = process.env.ASSIGNR_API_BASE || "https://app.assignr.com";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Missing Assignr credentials in environment variables" },
      { status: 500 },
    );
  }

  try {
    const formData = new URLSearchParams();
    formData.append("grant_type", "client_credentials");
    formData.append("client_id", clientId);
    formData.append("client_secret", clientSecret);
    formData.append("scope", "read"); // Adjust scope if needed (e.g., "read write")

    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: `Token request failed: ${response.status} - ${text}` },
        { status: response.status },
      );
    }

    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("Token fetch error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Network error: ${errorMessage}` },
      { status: 500 },
    );
  }
}
