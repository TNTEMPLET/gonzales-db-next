import { revalidateTag } from "next/cache";

import { ASSIGNR_GAMES_CACHE_TAG } from "@/lib/assignr/cacheTags";

export function revalidateAssignrGamesCache() {
  revalidateTag(ASSIGNR_GAMES_CACHE_TAG, "max");
}
