import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";

type HoldGame = FieldDeskGame & { fieldKey: string };

/** Same field-desk rule: the next game on a field waits while a controller is still out. */
export function withControllerHolds(games: readonly HoldGame[]): FieldDeskGame[] {
  const heldByField = new Map<string, HoldGame>();
  for (const game of games) {
    if (game.checkoutStatus === "out") heldByField.set(game.fieldKey, game);
  }
  return games.map(({ fieldKey, ...game }) => {
    const holder = heldByField.get(fieldKey);
    return {
      ...game,
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
