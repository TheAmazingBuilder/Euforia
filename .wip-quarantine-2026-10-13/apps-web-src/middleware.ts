import { NextResponse, type NextRequest } from "next/server";

/**
 * Legacy deep-link router — Events, Tasky and Nofy are INDEPENDENT sidebar
 * modules now. Old /academy?section=… and /academy?tab=… links get a real
 * HTTP 307 to the standalone routes, preserving every other query parameter.
 */
const LEGACY_TARGETS: Record<string, string> = {
  nofy: "/nofy",
  events: "/events",
  tasky: "/tasky",
};

export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const legacyKey = searchParams.get("section") ?? searchParams.get("tab");
  const target = legacyKey ? LEGACY_TARGETS[legacyKey] : undefined;
  if (!target) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = target;
  url.searchParams.delete("section");
  url.searchParams.delete("tab");
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/academy"],
};
