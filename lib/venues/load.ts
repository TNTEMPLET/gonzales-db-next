import prisma from "@/lib/prisma";
import { buildParksScreen, type ParksScreenModel } from "@/lib/venues/screen";

const venueSelect = {
  id: true,
  name: true,
  shortName: true,
  address: true,
  notes: true,
  isActive: true,
  normalizedName: true,
} as const;

const parkSelect = {
  id: true,
  organizationId: true,
  name: true,
  shortName: true,
  address: true,
  isActive: true,
  venueId: true,
} as const;

export async function listVenueMatchInputs() {
  const [venues, parks] = await Promise.all([
    prisma.venue.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: venueSelect }),
    prisma.schedulePark.findMany({
      orderBy: [{ organizationId: "asc" }, { name: "asc" }],
      select: parkSelect,
    }),
  ]);
  return { venues, parks };
}

export async function loadParksScreen(): Promise<ParksScreenModel> {
  const { venues, parks } = await listVenueMatchInputs();
  return buildParksScreen(parks, venues);
}
