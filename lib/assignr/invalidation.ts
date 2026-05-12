import { revalidateTag } from "next/cache";

export const ASSIGNR_GAMES_CACHE_TAG = "assignr-games";

export function revalidateAssignrGamesCache() {
  revalidateTag(ASSIGNR_GAMES_CACHE_TAG, "max");
}
