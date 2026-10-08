import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";
import type { ContentOrgId } from "@/lib/siteConfig";

import type { GameDayParkChoice } from "@/lib/admin/gameDay/parks";
import type { GameDayTab } from "@/lib/admin/gameDay/tabs";

export type GameDayListGame = {
  id: string;
  when: string;
  division: string;
  homeTeam: string;
  awayTeam: string;
  place: string;
  leagueLabel: string;
  leaguePrimaryHex: string;
  badgeText: "#111827" | "#ffffff";
  rainedOut: boolean;
};

export type GameDayCardGame = GameDayListGame & {
  parkName: string;
  fieldName: string;
  crew: string[];
};

export type GameDayScoreGame = {
  id: string;
  organizationId: ContentOrgId;
  sourceKey: string;
  matchId: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  when: string;
  place: string;
  leagueLabel: string;
  leaguePrimaryHex: string;
  badgeText: "#111827" | "#ffffff";
  homeScore: number | null;
  awayScore: number | null;
};

export type GameDayPayRow = {
  umpireId: string;
  name: string;
  games: number;
  totalPay: number;
};

export type GameDayPageData = {
  org: ContentOrgId;
  day: string;
  dayLabel: string;
  tab: GameDayTab;
  mode: "assigned" | "league";
  parks: GameDayParkChoice[];
  selectedParkId: string | null;
  selectedParkLabel: string | null;
  needsParkChoice: boolean;
  rainoutLines: string[];
  todayGames: GameDayListGame[];
  cardGames: GameDayCardGame[];
  scoreGames: GameDayScoreGame[];
  /** True when every game past first pitch is at a park that does not take scores. */
  scoresClosedForPark: boolean;
  controllerGames: FieldDeskGame[];
  payRows: GameDayPayRow[];
  payTotal: number;
  payError: string | null;
  crewUnavailable: boolean;
  directorOnly: boolean;
  seasonSetupHref: string;
};
