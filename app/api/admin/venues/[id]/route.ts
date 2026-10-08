import { NextRequest, NextResponse } from "next/server";

import { requireVenuesAdmin } from "@/lib/venues/apiAuth";
import { loadParksScreen } from "@/lib/venues/load";
import { updateVenue } from "@/lib/venues/mutate";
import { parseVenueWrite } from "@/lib/venues/validate";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireVenuesAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { id } = await params;
  const parsed = parseVenueWrite(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await updateVenue(id, parsed.value);
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
