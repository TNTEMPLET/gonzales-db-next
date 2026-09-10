import "server-only";

import { fetchGames } from "@/lib/fetchGames";
import {
  buildMainReportRows,
  buildUmpireReportRows,
  matchesLeagueFilter,
  normalizeAgeGroup,
  parseLeagueFilter,
} from "@/lib/admin/umpirePayRows";
import { buildPayByParkPdf, buildPayByUmpirePdf } from "@/lib/admin/umpirePayPdf";
import { reportFilenameStem } from "@/lib/admin/reportPdf";
import { getAssignrLeagueId, type ContentOrgId } from "@/lib/siteConfig";

export async function loadUmpirePayReport(input: {
  orgId: ContentOrgId;
  orgName: string;
  startDate: string;
  endDate: string;
  league?: string | null;
}) {
  const league = parseLeagueFilter(input.league ?? null);
  const games = (
    await fetchGames({
      startDate: input.startDate,
      endDate: input.endDate,
      leagueId: getAssignrLeagueId(input.orgId),
      limit: 50,
    })
  ).filter((game) => {
    const status = String(game.status || "").trim().toUpperCase();
    if (status === "X") return false;
    return matchesLeagueFilter(normalizeAgeGroup(game.age_group as string | undefined), league);
  });

  const parkPdf = buildPayByParkPdf({
    orgName: input.orgName,
    startDate: input.startDate,
    endDate: input.endDate,
    rows: buildMainReportRows(games),
  });
  const umpirePdf = buildPayByUmpirePdf({
    orgName: input.orgName,
    startDate: input.startDate,
    endDate: input.endDate,
    rows: buildUmpireReportRows(games),
  });

  return {
    parkPdf,
    umpirePdf,
    parkFilename: `${reportFilenameStem(["pay-by-park", input.orgName, input.startDate, "to", input.endDate])}.pdf`,
    umpireFilename: `${reportFilenameStem(["pay-by-umpire", input.orgName, input.startDate, "to", input.endDate])}.pdf`,
    gameCount: games.length,
  };
}
