/** Cache-busted src for bracket watermark `<img>` (logo changes must not reuse browser cache). */
export function bracketWatermarkSrc(
  flyerLogoUrl: string | undefined | null,
  siteDefaultLogoPath: string,
  cacheVersion?: string | number | Date,
): string {
  const base = flyerLogoUrl?.trim() || siteDefaultLogoPath;
  if (cacheVersion == null) return base;
  const v =
    cacheVersion instanceof Date ? cacheVersion.getTime() : String(cacheVersion);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${encodeURIComponent(v)}`;
}
