export type PracticeBoardCell = {
  cycleWeek: number;
  fieldId: string;
  parkId: string;
  dayOfWeek: number;
  startTime: string;
  firstTeamId: string;
  secondTeamId: string;
};

export type PracticeAssignment = {
  teamId: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  parkId: string | null;
  fieldId: string | null;
  pairWithTeamId: string | null;
  notes: string | null;
};

export function rotationNote(cycleWeek: number, cycleWeeks: number): string | null {
  if (cycleWeeks <= 1 || cycleWeek < 1) return null;
  return `Week ${cycleWeek}`;
}

export function parseRotationNote(notes: string | null | undefined): { week: number; total: number } | null {
  if (!notes) return null;
  const match = /^Week (\d+)(?: of (\d+))?/.exec(notes.trim());
  if (!match) return null;
  return { week: Number(match[1]), total: match[2] ? Number(match[2]) : 0 };
}

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const nextHour = Math.floor(total / 60) % 24;
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

/** Flatten board cells into POST rows. Paired cells emit one row (partner is created by the API). */
export function assignmentsFromBoard(
  cells: readonly PracticeBoardCell[],
  durationMinutes: number,
  cycleWeeks: number,
): PracticeAssignment[] {
  const assignments: PracticeAssignment[] = [];
  const seenPairs = new Set<string>();
  for (const cell of cells) {
    const first = cell.firstTeamId.trim();
    if (!first) continue;
    const second = cell.secondTeamId.trim();
    const notes = rotationNote(cell.cycleWeek, cycleWeeks);
    const key = `${cell.cycleWeek}|${cell.fieldId}|${cell.dayOfWeek}|${cell.startTime}|${first}|${second}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    assignments.push({
      teamId: first,
      dayOfWeek: cell.dayOfWeek,
      startTime: cell.startTime,
      durationMinutes,
      parkId: cell.parkId || null,
      fieldId: cell.fieldId || null,
      pairWithTeamId: second || null,
      notes,
    });
  }
  return assignments;
}

export function partnerStartTime(startTime: string, durationMinutes: number): string {
  return addMinutes(startTime, durationMinutes);
}

export function mlbNickname(teamName: string): string {
  const base = teamName.split(" - ")[0]?.trim() || teamName.trim();
  if (base === "A's" || base === "Athletics") return "Athletics";
  return base;
}

export function matchTeamByNickname(
  teams: readonly { teamId: string; teamName: string }[],
  nickname: string,
): { teamId: string; teamName: string } | null {
  const want = mlbNickname(nickname);
  const hits = teams.filter((team) => mlbNickname(team.teamName) === want);
  return hits.length === 1 ? hits[0] : hits[0] ?? null;
}
