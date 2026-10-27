import { NextResponse, type NextRequest } from "next/server";
import { getMakerSlugFromHostname } from "@/lib/maker-sites/config";

export function proxy(request: NextRequest) {
  const makeSlug = getMakerSlugFromHostname(request.headers.get("host") || "");
  if (!makeSlug) return NextResponse.next();

  if (isMainSiteRoute(request.nextUrl.pathname)) {
    return NextResponse.redirect(getMainSiteUrl(request), 307);
  }

  if (request.nextUrl.pathname === "/") {
    const destination = request.nextUrl.clone();
    destination.pathname = `/maker-sites/${makeSlug}`;
    return NextResponse.rewrite(destination);
  }

  const modelMatch = request.nextUrl.pathname.match(/^\/models\/([^/]+)\/?$/);
  if (modelMatch) {
    const destination = request.nextUrl.clone();
    destination.pathname = `/make/${makeSlug}/${modelMatch[1]}`;
    return NextResponse.rewrite(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/models/:path*", "/garage/:path*", "/login", "/api/auth/:path*"],
};

function isMainSiteRoute(pathname: string) {
  return pathname === "/garage"
    || pathname.startsWith("/garage/")
    || pathname === "/login"
    || pathname.startsWith("/api/auth/");
}

function getMainSiteUrl(request: NextRequest) {
  const destination = request.nextUrl.clone();
  const requestHost = (request.headers.get("host") || request.nextUrl.host).toLowerCase();
  const isLocalMakerHost = requestHost.split(":")[0].endsWith(".localhost");
  destination.hostname = isLocalMakerHost ? "localhost" : "supercardash.com";
  return destination;
}
