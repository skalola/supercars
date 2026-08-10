import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAffiliateTrackingReady, isSafeOutboundUrl } from "@/lib/parts/affiliate-tracking";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{
    partId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { partId } = await params;

  const part = await prisma.performancePart.findUnique({
    where: { id: partId },
    include: {
      affiliatePartner: true,
    },
  });

  if (!part || !isAffiliateTrackingReady(part) || !isSafeOutboundUrl(part.affiliateUrl)) {
    return NextResponse.redirect(new URL("/parts?affiliate=not-configured", request.url), { status: 303 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id || undefined;
  const outboundUrl = part.affiliateUrl;
  if (!outboundUrl) {
    return NextResponse.redirect(new URL("/parts?affiliate=not-configured", request.url), { status: 303 });
  }

  await prisma.partAffiliateClick.create({
    data: {
      partId: part.id,
      affiliatePartnerId: part.affiliatePartnerId,
      userId,
      outboundUrl,
      sourcePath: getSourcePath(request),
      ipHash: hashHeaderValue(getClientIp(request)),
      userAgentHash: hashHeaderValue(request.headers.get("user-agent")),
    },
  });

  return NextResponse.redirect(outboundUrl, { status: 302 });
}

function getSourcePath(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source");
  if (source) return source.slice(0, 240);

  const referer = request.headers.get("referer");
  if (!referer) return request.nextUrl.pathname;

  try {
    const parsed = new URL(referer);
    return `${parsed.pathname}${parsed.search}`.slice(0, 240);
  } catch {
    return request.nextUrl.pathname;
  }
}

function getClientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip")
  );
}

function hashHeaderValue(value: string | null | undefined) {
  if (!value) return undefined;
  const salt =
    process.env.AFFILIATE_CLICK_SALT ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "supercar-dash-affiliate-clicks";

  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}
