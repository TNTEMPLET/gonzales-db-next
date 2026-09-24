export type FieldDeskGame = {
  id: string;
  dateKey: string;
  when: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  parkName: string;
  fieldName: string;
  checkoutStatus: "in" | "out" | "returned";
  checkoutSide: "home" | "away" | null;
  checkoutTeam: string | null;
  checkoutName: string | null;
  checkoutNote: string | null;
  /** Another game on this field still has the only controller. */
  controllerHold: { when: string; volunteer: string; matchup: string } | null;
  isToday: boolean;
};
