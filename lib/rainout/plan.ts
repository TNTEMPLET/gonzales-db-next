import { leagueCalendarDate } from "@/lib/seasonConfig";
import { getOrgDisplayName, isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

import { loadKnownParkNames, loadNotifiedParkKeys, loadRainoutAudience, loadSuppressedEmails } from "./load";
import { countOutcomes, deliveryOutcome, toFamilyViews } from "./outcomes";
import { newlyAffectedParks, parksTreatedAsOut, resolveRainoutSelection } from "./parks";
import { rainoutEmailAllowlist, rainoutSendingEnabled } from "./policy";
import { groupRainoutFamilies, type RainoutFamilyEmail } from "./recipients";
import type { RainoutNotifySummary } from "./types";

export type RainoutPlan = {
  organizationId: ContentOrgId;
  calendarDate: string;
  orgName: string;
  allParksOut: boolean;
  parks: string[];
  treatedAsOut: string[];
  newlyAffected: string[];
  families: RainoutFamilyEmail[];
  suppressedEmails: Set<string>;
  allowlist: Set<string> | null;
  emailsEnabled: boolean;
};

export async function planRainout(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
  asOf?: Date;
}): Promise<{ ok: true; plan: RainoutPlan } | { ok: false; error: string }> {
  if (!isContentOrgId(input.organizationId)) {
    return { ok: false, error: "Unknown league." };
  }
  const organizationId = input.organizationId;
  const asOf = input.asOf ?? new Date();
  const calendarDate = leagueCalendarDate(asOf);
  const [knownParks, audience, alreadyNotified, suppressedEmails] = await Promise.all([
    loadKnownParkNames(organizationId, asOf),
    loadRainoutAudience(organizationId, calendarDate),
    loadNotifiedParkKeys(organizationId, calendarDate),
    loadSuppressedEmails(organizationId),
  ]);

  const selection = resolveRainoutSelection({
    allParksOut: input.allParksOut,
    requestedParks: input.parks,
    knownParks,
  });
  if (!selection.ok) return selection;

  const treatedAsOut = parksTreatedAsOut({
    allParksOut: selection.allParksOut,
    parks: selection.parks,
    knownParks,
    gameParkNames: audience.games.map((game) => game.parkName),
  });
  const newlyAffected = newlyAffectedParks(treatedAsOut, alreadyNotified);
  const rainedOutParks = selection.allParksOut ? treatedAsOut : selection.parks;
  const families = groupRainoutFamilies({
    orgName: getOrgDisplayName(organizationId),
    calendarDate,
    games: audience.games,
    teams: audience.teams,
    players: audience.players,
    allParksOut: selection.allParksOut,
    rainedOutParks,
    newlyAffectedParks: newlyAffected,
  });

  return {
    ok: true,
    plan: {
      organizationId,
      calendarDate,
      orgName: getOrgDisplayName(organizationId),
      allParksOut: selection.allParksOut,
      parks: selection.parks,
      treatedAsOut,
      newlyAffected,
      families,
      suppressedEmails,
      allowlist: rainoutEmailAllowlist(),
      emailsEnabled: rainoutSendingEnabled(),
    },
  };
}

export function summarizePlan(plan: RainoutPlan, phase: RainoutNotifySummary["phase"]): RainoutNotifySummary {
  const families = toFamilyViews(plan.families, (email) =>
    deliveryOutcome({
      email,
      emailsEnabled: plan.emailsEnabled,
      allowlist: plan.allowlist,
      suppressed: plan.suppressedEmails.has(email),
    }),
  );
  const counts = countOutcomes(families);
  return {
    phase,
    dryRun: !plan.emailsEnabled,
    emailsEnabled: plan.emailsEnabled,
    allowlistActive: plan.allowlist !== null,
    calendarDate: plan.calendarDate,
    allParksOut: plan.allParksOut,
    parks: plan.parks,
    newlyAffectedParks: plan.newlyAffected,
    sent: counts.sent,
    dryRunCount: counts.dryRunCount,
    skippedSuppressed: counts.skippedSuppressed,
    skippedAllowlist: counts.skippedAllowlist,
    failed: counts.failed,
    families,
    error: null,
  };
}
