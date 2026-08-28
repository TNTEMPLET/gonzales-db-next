import type { GcScoreboardEvent } from "@/lib/gamechanger/types";

const GC_FAN_BASE = "https://web.gc.com";

export function gcOrganizationEventFanUrl(organizationId: string, eventId: string): string {
  return `${GC_FAN_BASE}/organizations/${organizationId}/schedule/${eventId}`;
}

export function eventHasLiveVideo(event: GcScoreboardEvent): boolean {
  return event.home_team.is_video_live === true || event.away_team.is_video_live === true;
}

export function eventHasArchivedVideo(event: GcScoreboardEvent): boolean {
  return event.home_team.has_archived_video === true || event.away_team.has_archived_video === true;
}

export function eventWatchLabel(event: GcScoreboardEvent, isLive: boolean): string | undefined {
  if (isLive && eventHasLiveVideo(event)) return "Watch live on GameChanger";
  if (eventHasArchivedVideo(event)) return "Watch replay on GameChanger";
  return undefined;
}
