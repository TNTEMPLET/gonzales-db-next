import type { AllStarBallotPhase } from "@prisma/client";

export function parseAllStarPhase(value: string | null | undefined): AllStarBallotPhase | null {
  if (value === "FIRST_TEAM" || value === "SECOND_TEAM") return value;
  return null;
}
