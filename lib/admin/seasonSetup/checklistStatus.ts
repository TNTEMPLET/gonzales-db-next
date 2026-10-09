/** The two items with no clean auto-detect signal -- an admin checks these off manually. */
export const MANUAL_CHECKLIST_ITEM_KEYS = [
  "REGISTRATION_WINDOW_SET",
  "JERSEY_ORDERS_SUBMITTED",
] as const;
export type ManualChecklistItemKey = (typeof MANUAL_CHECKLIST_ITEM_KEYS)[number];

export function isManualChecklistItemKey(key: string): key is ManualChecklistItemKey {
  return (MANUAL_CHECKLIST_ITEM_KEYS as readonly string[]).includes(key);
}

export type ChecklistStepStatus = "COMPLETE" | "INCOMPLETE" | "PARTIAL";

/**
 * Saved SeasonOrgSettings.divisionAgesJson only.
 * Null, a missing row, and built-in or league defaults are not a saved table.
 */
export function divisionAgesConfirmedStatus(divisionAgesJson: unknown): "COMPLETE" | "INCOMPLETE" {
  if (divisionAgesJson == null) return "INCOMPLETE";
  if (typeof divisionAgesJson === "object") return "COMPLETE";
  return "INCOMPLETE";
}

export type ParkReadinessPark = {
  name: string;
  isActive: boolean;
  venueId: string | null;
};

export type ParkReadinessVenue = {
  id: string;
  isActive: boolean;
};

export type ParkReadinessDirector = {
  venueId: string;
  active: boolean;
};

export type ParkReadinessRemote = {
  venueId: string;
  status: string;
};

export type ParkReadinessSubItem = {
  label: string;
  status: "COMPLETE" | "INCOMPLETE";
};

export type ParksDirectorsRemotesResult = {
  status: ChecklistStepStatus;
  progressLabel?: string;
  subItems: ParkReadinessSubItem[];
};

/**
 * One active league park is ready when it points at an active venue that has
 * an active director and an ACTIVE remote. Retired, missing, and repair remotes
 * do not count. Inactive parks are ignored.
 */
export function classifyParksDirectorsRemotes(input: {
  parks: readonly ParkReadinessPark[];
  venues: readonly ParkReadinessVenue[];
  directors: readonly ParkReadinessDirector[];
  remotes: readonly ParkReadinessRemote[];
}): ParksDirectorsRemotesResult {
  const activeVenueIds = new Set(input.venues.filter((venue) => venue.isActive).map((venue) => venue.id));
  const directorVenueIds = new Set(
    input.directors
      .filter((director) => director.active && activeVenueIds.has(director.venueId))
      .map((director) => director.venueId),
  );
  const remoteVenueIds = new Set(
    input.remotes
      .filter((remote) => remote.status === "ACTIVE" && activeVenueIds.has(remote.venueId))
      .map((remote) => remote.venueId),
  );

  const activeParks = input.parks.filter((park) => park.isActive);
  const subItems: ParkReadinessSubItem[] = activeParks.map((park) => {
    const venueId = park.venueId;
    const ready =
      venueId != null &&
      activeVenueIds.has(venueId) &&
      directorVenueIds.has(venueId) &&
      remoteVenueIds.has(venueId);
    return { label: park.name, status: ready ? "COMPLETE" : "INCOMPLETE" };
  });

  if (activeParks.length === 0) {
    return { status: "INCOMPLETE", subItems };
  }

  const readyCount = subItems.filter((item) => item.status === "COMPLETE").length;
  const anySignal = activeParks.some((park) => {
    const venueId = park.venueId;
    if (venueId == null || !activeVenueIds.has(venueId)) return false;
    return true;
  });
  const progressLabel = `${readyCount}/${activeParks.length} parks ready`;
  if (readyCount === activeParks.length) {
    return { status: "COMPLETE", progressLabel, subItems };
  }
  if (!anySignal) {
    return { status: "INCOMPLETE", progressLabel, subItems };
  }
  return { status: "PARTIAL", progressLabel, subItems };
}
