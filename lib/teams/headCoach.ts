/**
 * Resolves the head coach for a team from its coach assignments. No shared
 * helper existed for this before -- lib/admin/jerseyReport.ts resolves the
 * same thing inline. New callers (Equipment Checkout) should use this
 * instead of re-deriving it.
 */
export type HeadCoachAssignment<TUser extends { id: string } = { id: string }> = {
  role: "HEAD_COACH" | "ASSISTANT_COACH";
  registeredUser: TUser;
};

export function getHeadCoachForTeam<TUser extends { id: string }>(
  coachAssignments: HeadCoachAssignment<TUser>[],
): TUser | null {
  const headCoach = coachAssignments.find((a) => a.role === "HEAD_COACH");
  return headCoach?.registeredUser ?? null;
}
