import { NextRequest, NextResponse } from "next/server";

import { requireVenuesAdmin } from "@/lib/venues/apiAuth";
import { loadParksScreen } from "@/lib/venues/load";
import { createVenue } from "@/lib/venues/mutate";
import { parseVenueWrite } from "@/lib/venues/validate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireVenuesAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const screen = await loadParksScreen();
  return NextResponse.json({ screen });
}

export async function POST(request: NextRequest) {
  const auth = await requireVenuesAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const parsed = parseVenueWrite(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await createVenue(parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ screen: await loadParksScreen() }, { status: 201 });
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
