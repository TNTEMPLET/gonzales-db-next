import type { NextRequest } from "next/server";

/** Build an absolute URL using the client-facing host, not the server's bind address. */
export function requestPublicUrl(request: NextRequest, path: string): URL {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return new URL(path, `${proto}://${host}`);
  }

  return new URL(path, request.nextUrl);
}
