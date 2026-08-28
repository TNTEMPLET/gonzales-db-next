/**
 * Shared draft-board types, used by both the API routes/engine (server) and
 * the admin draft components (client). Keeping one definition per shape
 * avoids the shapes drifting out of sync across files.
 */

export type DraftUserRef = {
  id: string;
  name: string | null;
  email: string;
};

/** A candidate for Draft Leader assignment, from `GET /sessions?context=true`. */
export type DraftLeaderOption = DraftUserRef & {
  isBoardMember?: boolean;
  isCoach?: boolean;
};

export type DraftPick = {
  id: string;
  round: number;
  overallPick: number;
  draftTeamId: string;
  playerPoolId: string;
  isProtectedPick: boolean;
  pickedAt: string;
  pickedByAdminId?: string | null;
};

export type DraftProtection = {
  id: string;
  draftTeamId: string;
  registeredUserId?: string | null;
  playerName: string;
  guardianEmail?: string | null;
  protectionType: "HEAD_COACH_CHILD" | "ASSISTANT_COACH_CHILD" | "PAIRING_REQUEST" | "RETURNING_PLAYER";
  protectedRound: number;
  isClaimed: boolean;
};

export type DraftTeam = {
  id: string;
  teamName: string;
  draftOrder: number;
  headCoachUserId?: string | null;
  assistantUserId?: string | null;
  headCoach?: DraftUserRef | null;
  assistantCoach?: DraftUserRef | null;
  picks?: DraftPick[];
  protections?: DraftProtection[];
};

export type DraftPlayerPoolItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  birthDate: string | null;
  evaluationScore: number | null;
  pitcherRating: number | null;
  catcherRating: number | null;
  notes: string | null;
  isDrafted: boolean;
  draftedTeamId: string | null;
};

export type DraftSessionStatus =
  | "SETUP"
  | "PAIRED"
  | "LIVE"
  | "PAUSED"
  | "COMPLETED"
  | "MATERIALIZED";

export type DraftSession = {
  id: string;
  organizationId: string;
  seasonYear: number;
  name: string;
  ageGroup: string;
  draftType: "SNAKE" | "LINEAR";
  status: DraftSessionStatus;
  secondsPerPick: number | null;
  totalRounds: number;
  currentRound: number;
  currentPickIndex: number;
  draftLeaderUserId?: string | null;
  draftLeader?: DraftUserRef | null;
  teams: DraftTeam[];
  playerPool: DraftPlayerPoolItem[];
  picks: DraftPick[];
  protections: DraftProtection[];
};

/** The team currently on the clock, as computed by `calculateTeamOnClock`. */
export type ActiveTeamOnClock = {
  teamId: string;
  teamName: string;
  headCoachName: string | null;
  round: number;
  overallPick: number;
  pickInRound: number;
  isProtectedPick: boolean;
  protectedPlayerName?: string;
  protectedPlayerPoolId?: string;
  protectedPlayerProtectionType?: DraftProtection["protectionType"];
};

export type DraftSessionState = {
  session: DraftSession;
  onClock: ActiveTeamOnClock | null;
};

/** Summary shape used by the session list view (OnlineDraftDesk). */
export type DraftSessionListItem = {
  id: string;
  name: string;
  ageGroup: string;
  seasonYear: number;
  status: string;
  draftType: string;
  secondsPerPick: number | null;
  totalRounds: number;
  draftLeaderUserId?: string | null;
  draftLeader?: DraftUserRef | null;
  _count: { playerPool: number; picks: number };
  teams: {
    id: string;
    teamName: string;
    draftOrder: number;
    headCoach?: { name: string | null } | null;
  }[];
};

/** A coach linked to a protected child pick, staged during session setup. */
export type CoachPairing = {
  coachUserId: string;
  coachName: string;
  coachEmail: string;
  /** The coach's linked child, if any. Omitted/empty means this coach has no
   * protected pick — their team's protected round stays open to draft normally. */
  playerName?: string;
  guardianEmail: string | null;
  protectedRound: number;
  role: "HEAD_COACH" | "ASSISTANT_COACH";
  assignedTeamName?: string;
};
