import { NextResponse, type NextRequest } from "next/server";
import { getMakerSlugFromHostname } from "@/lib/maker-sites/config";

export function proxy(request: NextRequest) {
  const makeSlug = getMakerSlugFromHostname(request.headers.get("host") || "");
  if (!makeSlug) return NextResponse.next();

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
  matcher: ["/", "/models/:path*"],
};
