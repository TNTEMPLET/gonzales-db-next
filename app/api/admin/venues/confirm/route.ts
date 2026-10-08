import { NextRequest, NextResponse } from "next/server";

import { requireVenuesAdmin } from "@/lib/venues/apiAuth";
import { loadParksScreen } from "@/lib/venues/load";
import { confirmParkSuggestion } from "@/lib/venues/mutate";
import { parseSuggestionConfirm } from "@/lib/venues/validate";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireVenuesAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const parsed = parseSuggestionConfirm(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await confirmParkSuggestion(parsed.parkId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ screen: await loadParksScreen() });
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
