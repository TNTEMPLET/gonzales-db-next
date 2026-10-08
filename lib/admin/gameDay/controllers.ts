import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";

type HoldGame = FieldDeskGame & { fieldKey: string; holdKey?: string | null };

/**
 * The next game on a field waits while a controller is still out.
 * Pass holdKey as venue plus normalized field name so the hold crosses leagues.
 */
export function withControllerHolds(games: readonly HoldGame[]): FieldDeskGame[] {
  const keyOf = (game: HoldGame) => game.holdKey || game.fieldKey;
  const heldByField = new Map<string, HoldGame>();
  for (const game of games) {
    if (game.checkoutStatus === "out") heldByField.set(keyOf(game), game);
  }
  return games.map((game) => {
    const holder = heldByField.get(keyOf(game));
    const { fieldKey, holdKey, ...rest } = game;
    void fieldKey;
    void holdKey;
    return {
      ...rest,
      controllerHold:
        holder && holder.id !== game.id
          ? {
              when: holder.when,
              volunteer: holder.checkoutName || "a volunteer",
              matchup: `${holder.awayTeam} at ${holder.homeTeam}`,
            }
          : null,
    };
  });
}
