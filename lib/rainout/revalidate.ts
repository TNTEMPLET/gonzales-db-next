import { revalidatePath } from "next/cache";

const RAINOUT_PATHS = ["/", "/admin", "/admin/alerts", "/schedule"] as const;

export function revalidateRainoutPaths() {
  for (const path of RAINOUT_PATHS) revalidatePath(path);
}
