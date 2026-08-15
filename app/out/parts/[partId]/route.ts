import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getPartOutboundRouting,
  isAffiliateTrackingReady,
  isSafeOutboundUrl,
} from "@/lib/parts/affiliate-tracking";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{
    partId: string;
  }>;
}

const CLICK_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { partId } = await params;

  const part = await getPartOutboundRouting(partId);

  if (!part || part.status !== "ACTIVE") {
    return NextResponse.redirect(new URL("/parts?outbound=part-unavailable", request.url), { status: 303 });
  }

  const session = await auth();
  const userId = session?.user?.id || undefined;
  const affiliateReady = isAffiliateTrackingReady(part) && isSafeOutboundUrl(part.affiliateUrl);
  const sourceReady = isSafeOutboundUrl(part.sourceUrl);
  const outboundUrl = affiliateReady ? part.affiliateUrl : sourceReady ? part.sourceUrl : null;

  if (!outboundUrl) {
    return NextResponse.redirect(new URL("/parts?outbound=missing-retailer", request.url), { status: 303 });
  }

  const sourcePath = getSourcePath(request, affiliateReady ? "affiliate" : "source");
  const ipHash = hashHeaderValue(getClientIp(request));
  const userAgentHash = hashHeaderValue(request.headers.get("user-agent"));
  const clickRef = createDedupeClickRef({
    partId: part.id,
    userId,
    ipHash,
    userAgentHash,
    sourcePath,
  });
  const clickData = {
    partId: part.id,
    affiliatePartnerId: affiliateReady ? part.affiliatePartnerId : null,
    userId,
    outboundUrl,
    sourcePath,
    ipHash,
    userAgentHash,
  };

  if (clickRef) {
    await prisma.partAffiliateClick.createMany({
      data: [{ ...clickData, clickRef }],
      skipDuplicates: true,
    });
  } else {
    await prisma.partAffiliateClick.create({ data: clickData });
  }

  return NextResponse.redirect(outboundUrl, { status: 302 });
}

function getSourcePath(request: NextRequest, routeType: "affiliate" | "source") {
  const source = request.nextUrl.searchParams.get("source");
  if (source) return `${routeType}:${source}`.slice(0, 240);

  const referer = request.headers.get("referer");
  if (!referer) return `${routeType}:${request.nextUrl.pathname}`;

  try {
    const parsed = new URL(referer);
    return `${routeType}:${parsed.pathname}${parsed.search}`.slice(0, 240);
  } catch {
    return `${routeType}:${request.nextUrl.pathname}`;
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
  const salt = getClickHashSalt();
  if (!salt) return undefined;

  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function getClickHashSalt() {
  const configured = process.env.AFFILIATE_CLICK_SALT || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "supercar-dash-affiliate-clicks";
}

function createDedupeClickRef({
  partId,
  userId,
  ipHash,
  userAgentHash,
  sourcePath,
}: {
  partId: string;
  userId?: string;
  ipHash?: string;
  userAgentHash?: string;
  sourcePath: string;
}) {
  const visitorKey = userId
    ? `user:${userId}`
    : ipHash || userAgentHash
      ? `anonymous:${ipHash || "unknown-ip"}:${userAgentHash || "unknown-agent"}`
      : null;

  if (!visitorKey) return undefined;

  const timeBucket = Math.floor(Date.now() / CLICK_DEDUPE_WINDOW_MS);
  return createHash("sha256")
    .update(`part-click:v1:${partId}:${visitorKey}:${sourcePath}:${timeBucket}`)
    .digest("hex");
}
