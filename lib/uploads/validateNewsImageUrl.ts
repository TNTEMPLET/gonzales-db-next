/**
 * Validates optional news hero image URLs: https only, or same-site paths (e.g. /uploads/...).
 */
export function parseOptionalNewsImageUrl(
  raw: string | null | undefined,
):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (raw == null || !String(raw).trim()) {
    return { ok: true, value: null };
  }
  const t = String(raw).trim();
  if (t.startsWith("/")) {
    if (t.includes("..") || t.length > 2048) {
      return { ok: false, error: "Invalid image path" };
    }
    return { ok: true, value: t };
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") {
      return { ok: false, error: "imageUrl must use https://" };
    }
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: "Invalid imageUrl" };
  }
}
