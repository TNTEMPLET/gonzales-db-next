import { createHash } from "node:crypto";

import type { AssignrGameImportRow } from "@/lib/assignr/gamesImportTypes";

export function buildGameIdempotencyKey(row: AssignrGameImportRow, leagueId: string) {
  const payload = [
    row.date,
    row.time,
    row.venue,
    row.subVenue,
    row.homeTeam,
    row.awayTeam,
    row.ageGroup,
    leagueId,
  ]
    .map((value) => value.trim().toLowerCase())
    .join("|");

  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function buildGameUserDefinedId(row: AssignrGameImportRow, leagueId: string) {
  return `ap-${buildGameIdempotencyKey(row, leagueId)}`;
}
