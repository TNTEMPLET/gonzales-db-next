import { NextResponse, type NextRequest } from "next/server";

const REPORTS_HOST = "reports.apbaseball.com";

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();

  if (host === REPORTS_HOST && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/reports";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
