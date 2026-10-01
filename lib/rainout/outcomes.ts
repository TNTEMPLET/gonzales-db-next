import { allowlistPermits } from "./policy";
import type { RainoutFamilyEmail } from "./recipients";
import type { RainoutDeliveryOutcome, RainoutFamilyView } from "./types";

export function deliveryOutcome(input: {
  email: string;
  emailsEnabled: boolean;
  allowlist: Set<string> | null;
  suppressed: boolean;
}): RainoutDeliveryOutcome {
  if (input.suppressed) return "suppressed";
  if (!allowlistPermits(input.email, input.allowlist)) return "allowlist";
  return input.emailsEnabled ? "send" : "dry_run";
}

export function toFamilyViews(
  families: RainoutFamilyEmail[],
  outcomeFor: (email: string) => RainoutDeliveryOutcome,
): RainoutFamilyView[] {
  return families.map((family) => ({
    email: family.email,
    mode: family.mode,
    subject: family.subject,
    text: family.text,
    outcome: outcomeFor(family.email),
    appearances: family.appearances.map((appearance) => ({
      playerName: appearance.playerName,
      teamName: appearance.teamName,
      ageGroup: appearance.ageGroup,
      parkName: appearance.parkName,
      timeLabel: appearance.timeLabel,
      opponent: appearance.opponent,
      rainedOut: appearance.rainedOut,
    })),
  }));
}

export function countOutcomes(families: RainoutFamilyView[]) {
  return {
    sent: 0,
    failed: 0,
    dryRunCount: families.filter((family) => family.outcome === "dry_run").length,
    skippedSuppressed: families.filter((family) => family.outcome === "suppressed").length,
    skippedAllowlist: families.filter((family) => family.outcome === "allowlist").length,
    sendable: families.filter((family) => family.outcome === "send").length,
  };
}
