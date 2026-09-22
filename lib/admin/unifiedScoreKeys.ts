export function leagueSourceKey() {
  return "league";
}

export function unifiedScoreGameId(
  sourceType: "LEAGUE" | "TOURNAMENT",
  organizationId: string,
  sourceKey: string,
  matchId: string,
) {
  return `${sourceType}:${organizationId}:${sourceKey}:${matchId}`;
}
