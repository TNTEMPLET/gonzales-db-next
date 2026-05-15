/** Hostnames allowed for server-side reference fetch (reduce abuse / respect boundaries). */
export const ALLOWED_REFERENCE_HOST_SUFFIXES = [
  "littleleague.org",
  "apbaseball.com",
  "dyb.com",
  "diamondyouth.com",
] as const;

export function isReferenceUrlAllowed(urlString: string): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_REFERENCE_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export async function fetchReferenceExcerpt(
  urlString: string,
  maxChars = 12000,
): Promise<{ ok: true; excerpt: string; contentType: string | null } | { ok: false; error: string }> {
  if (!isReferenceUrlAllowed(urlString)) {
    return { ok: false, error: "URL host is not on the allowlist for reference fetch." };
  }
  try {
    const res = await fetch(urlString, {
      headers: {
        "User-Agent": "APBaseball-TournamentBracketBot/1.0 (+https://admin.apbaseball.com)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const contentType = res.headers.get("content-type");
    const text = await res.text();
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      ok: true,
      excerpt: stripped.slice(0, maxChars),
      contentType,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
