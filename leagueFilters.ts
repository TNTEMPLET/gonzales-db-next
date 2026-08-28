type LeagueMeta = {
  ageGroup?: string | null;
  league?: string | null;
};

const LITTLE_LEAGUE_RE = /little\s*league/i;
const DIAMOND_KEYWORDS = [/diamond/i, /\bdbb\b/i];

function toMetaText({ ageGroup, league }: LeagueMeta) {
  return `${ageGroup || ""} ${league || ""}`.trim();
}

export function isLittleLeagueMeta(meta: LeagueMeta): boolean {
  return LITTLE_LEAGUE_RE.test(toMetaText(meta));
}

export function isDiamondMeta(meta: LeagueMeta): boolean {
  const text = toMetaText(meta);
  if (!text) return false;
  if (isLittleLeagueMeta(meta)) return false;
  return DIAMOND_KEYWORDS.some((pattern) => pattern.test(text));
}
