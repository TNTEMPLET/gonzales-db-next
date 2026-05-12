import type { AssignrGameImportRow } from "@/lib/assignr/gamesImportTypes";

export type AssignrGamePublishRow = AssignrGameImportRow;

export type AssignrGamePublishRequest = {
  organizationId: string;
  seasonYear: number;
  rows: AssignrGamePublishRow[];
};

export type AssignrGameBulkUpdateRequest = {
  organizationId: string;
  rows: Array<{
    gameId: string;
    localized_date?: string;
    localized_time?: string;
    venue_name?: string;
    subvenue?: string;
    home_team_name?: string;
    away_team_name?: string;
    age_group_name?: string;
    status?: string;
    is_public?: string;
    public_note_text?: string;
  }>;
};
