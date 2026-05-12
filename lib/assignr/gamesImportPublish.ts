import type { AssignrGameImportRow } from "@/lib/assignr/gamesImportTypes";

/**
 * Normalized Assignr game rows are shared by CSV export today and a future
 * authenticated publish endpoint that will POST games to Assignr.
 */
export type AssignrGamePublishRow = AssignrGameImportRow;

export type AssignrGamePublishRequest = {
  seasonYear: number;
  rows: AssignrGamePublishRow[];
};
