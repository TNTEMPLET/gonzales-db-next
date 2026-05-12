import { assignrFetch, getAssignrAccessToken } from "@/lib/assignr/client";
import { getAssignrApiBaseUrl } from "@/lib/assignr/config";
import { listAssignrGames, listUnassignedOfficialGamesForSite } from "@/lib/assignr/games";
import { listAssignrUsers } from "@/lib/assignr/officials";
import { listAssignrStatements } from "@/lib/assignr/statements";
import {
  fetchAssignrGamesForContentOrg,
  filterAssignrGamesForContentOrg,
} from "@/lib/admin/assignrOrgScope";
import { getAssignrLeagueId, getSiteConfigForOrg } from "@/lib/siteConfig";

const siteId = process.env.ASSIGNR_SITE_ID;
const base = getAssignrApiBaseUrl();

type HalList = {
  _embedded?: Record<string, unknown[]>;
  page?: { page?: number; pages?: number; count?: number };
};

async function fetchHal(path: string, searchParams: Record<string, string | number>) {
  return assignrFetch<HalList>(path, { searchParams, cache: "no-store" });
}

function embeddedKeys(data: HalList) {
  return Object.keys(data._embedded ?? {});
}

function embeddedCount(data: HalList, key: string) {
  return data._embedded?.[key]?.length ?? 0;
}

async function main() {
  await getAssignrAccessToken();

  const ranges = [
    { label: "today+7", start: "2026-05-12", end: "2026-05-19" },
    { label: "season", start: "2026-03-01", end: "2026-06-30" },
    { label: "eoy", start: "2026-05-18", end: "2026-05-21" },
  ];

  const leagues = [
    { label: "gonzales", id: getSiteConfigForOrg("gonzales").assignrLeagueId },
    { label: "ascension", id: getSiteConfigForOrg("ascension").assignrLeagueId },
    { label: "none", id: "" },
  ];

  console.log("siteId", siteId);
  console.log("envLeague", process.env.ASSIGNR_LEAGUE_ID ?? "(unset)");
  console.log("gonzalesLeague", getAssignrLeagueId("gonzales"));
  console.log("ascensionLeague", getAssignrLeagueId("ascension"));

  for (const range of ranges) {
    for (const league of leagues) {
      const params: Record<string, string | number> = {
        limit: 50,
        page: 1,
        "search[start_date]": range.start,
        "search[end_date]": range.end,
      };
      if (league.id) params["search[league_id]"] = league.id;
      const data = await fetchHal(`/api/v2/sites/${siteId}/games`, params);
      const keys = embeddedKeys(data);
      const count = keys.includes("games") ? embeddedCount(data, "games") : 0;
      console.log(
        `games ${range.label} ${league.label}: status ok keys=${keys.join(",")} page=${data.page?.page}/${data.page?.pages} count=${count}`,
      );
    }
  }

  const libGonzales = await listAssignrGames({
    startDate: "2026-05-18",
    endDate: "2026-05-21",
    leagueId: getAssignrLeagueId("gonzales"),
    cache: "no-store",
  });
  const libNoLeague = await listAssignrGames({
    startDate: "2026-05-18",
    endDate: "2026-05-21",
    cache: "no-store",
  });
  const scopedGonzales = await fetchAssignrGamesForContentOrg("gonzales", {
    startDate: "2026-05-18",
    endDate: "2026-05-21",
    cache: "no-store",
  });
  console.log("lib games eoy gonzales league", libGonzales.length);
  console.log("lib games eoy no league", libNoLeague.length);
  console.log("scoped games eoy gonzales", scopedGonzales.length);
  console.log(
    "scoped sample leagues",
    filterAssignrGamesForContentOrg(libNoLeague, "gonzales")
      .slice(0, 3)
      .map((game) => game.age_group),
  );

  const sample = libNoLeague[0];
  if (sample) {
    console.log("sample game", {
      id: sample.id,
      localized_date: sample.localized_date,
      league_id: sample.league_id,
      age_group: sample.age_group,
      home_team: sample.home_team,
      away_team: sample.away_team,
      user_defined_id: sample.user_defined_id,
    });
  }

  const users = await listAssignrUsers({ org: "gonzales", limit: 5 });
  console.log("site users gonzales", users.length);

  const statements = await listAssignrStatements({ limit: 5 });
  console.log("statements", statements.length);

  const unassigned = await listUnassignedOfficialGamesForSite({
    startDate: "2026-05-18",
    endDate: "2026-05-21",
    leagueId: getAssignrLeagueId("gonzales"),
  });
  console.log("unassigned eoy gonzales", unassigned.length);

  const token = await getAssignrAccessToken();
  const headers = {
    Accept: "application/vnd.assignr.v2.hal+json",
    Authorization: `Bearer ${token}`,
  };
  const badUsers = await fetch(`${base}/api/v2/users?limit=1`, { headers });
  console.log("legacy /users status", badUsers.status);

  const raw = await fetchHal(`/api/v2/sites/${siteId}/games`, {
    limit: 2,
    page: 1,
    "search[start_date]": "2026-05-18",
    "search[end_date]": "2026-05-21",
  });
  const game0 = raw._embedded?.games?.[0] as Record<string, unknown> | undefined;
  console.log("raw page meta", JSON.stringify(raw.page));
  console.log(
    "game0 league",
    JSON.stringify({
      league_id: game0?.league_id,
      league: game0?.league,
      embeddedLeague: (game0?._embedded as { league?: unknown } | undefined)?.league,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
