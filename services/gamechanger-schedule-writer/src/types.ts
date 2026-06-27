export type CreateGameRequest = {
  bracketProjectId: string;
  matchId: string;
  gameNumber?: string;
  division?: string;
  date?: string;
  time?: string;
  scheduledFor?: string;
  venue?: string;
  field?: string;
  homeTeam: string;
  awayTeam: string;
  widgetId?: string;
  gcOrganizationId?: string;
  gcFormDate?: string;
  gcFormTime?: string;
  durationLabel?: string;
};

export type CreateGameResponse = {
  eventId: string;
};
