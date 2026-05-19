/**
 * Uploaded league logos are stored under `/uploads/...` in local dev only.
 * On Vercel, those files are not deployed; use the org default until re-uploaded on the live site (Blob URL).
 */
export function isLocalDevUploadUrl(url: string): boolean {
  return url.startsWith("/uploads/");
}

export function resolveBracketWatermarkBase(
  flyerLogoUrl: string | undefined | null,
  siteDefaultLogoPath: string,
): string {
  const raw = flyerLogoUrl?.trim();
  if (!raw) return siteDefaultLogoPath;
  if (isLocalDevUploadUrl(raw) && process.env.VERCEL === "1") {
    return siteDefaultLogoPath;
  }
  return raw;
}

/** Cache-busted src for bracket watermark `<img>` (logo changes must not reuse browser cache). */
export function bracketWatermarkSrc(
  flyerLogoUrl: string | undefined | null,
  siteDefaultLogoPath: string,
  cacheVersion?: string | number | Date,
): string {
  const base = resolveBracketWatermarkBase(flyerLogoUrl, siteDefaultLogoPath);
  if (cacheVersion == null) return base;
  const v =
    cacheVersion instanceof Date ? cacheVersion.getTime() : String(cacheVersion);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${encodeURIComponent(v)}`;
}
