import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSafeOutboundUrl } from "@/lib/parts/affiliate-tracking";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ offerId: string }> };
const CLICK_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { offerId } = await params;
  const offer = await prisma.partOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      partId: true,
      provider: true,
      externalItemId: true,
      affiliateReferenceId: true,
      affiliateUrl: true,
      active: true,
      expiresAt: true,
      affiliatePartnerId: true,
      part: { select: { status: true } },
      contexts: {
        where: { active: true, modelPartComponent: { active: true } },
        select: { modelPartComponentId: true },
        take: 25,
      },
    },
  });

  if (
    !offer ||
    !offer.active ||
    (offer.part?.status !== "ACTIVE" && offer.contexts.length === 0) ||
    (offer.expiresAt && offer.expiresAt <= new Date()) ||
    typeof offer.affiliateUrl !== "string" ||
    !isSafeOutboundUrl(offer.affiliateUrl)
  ) {
    return NextResponse.redirect(new URL("/parts?outbound=offer-unavailable", request.url), { status: 303 });
  }

  const session = await auth();
  const userId = session?.user?.id || undefined;
  const requestedVehicleId = request.nextUrl.searchParams.get("vehicleId");
  const vehicleId = requestedVehicleId && userId
    ? (await prisma.vehicle.findFirst({
        where: { id: requestedVehicleId, ownerId: userId },
        select: { id: true },
      }))?.id
    : undefined;
  const sourcePath = getSourcePath(request);
  const requestedContextId = request.nextUrl.searchParams.get("componentContext");
  const modelPartComponentId = requestedContextId && offer.contexts.some((context) => context.modelPartComponentId === requestedContextId)
    ? requestedContextId
    : offer.contexts[0]?.modelPartComponentId;
  const ipHash = hashHeaderValue(getClientIp(request));
  const userAgentHash = hashHeaderValue(request.headers.get("user-agent"));
  const clickRef = createHash("sha256")
    .update([
      "offer-click:v1",
      offer.id,
      userId || ipHash || userAgentHash || "anonymous",
      sourcePath,
      Math.floor(Date.now() / CLICK_DEDUPE_WINDOW_MS),
    ].join(":"))
    .digest("hex");

  await prisma.partAffiliateClick.createMany({
    data: [{
      partId: offer.partId,
      offerId: offer.id,
      modelPartComponentId,
      affiliatePartnerId: offer.affiliatePartnerId,
      vehicleId,
      userId,
      outboundUrl: offer.affiliateUrl,
      provider: offer.provider,
      externalItemId: offer.externalItemId,
      affiliateReferenceId: offer.affiliateReferenceId,
      sourcePath,
      ipHash,
      userAgentHash,
      clickRef,
    }],
    skipDuplicates: true,
  });

  return NextResponse.redirect(offer.affiliateUrl, { status: 302 });
}

function getSourcePath(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source");
  return `affiliate:${source || request.nextUrl.pathname}`.slice(0, 240);
}

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || request.headers.get("cf-connecting-ip");
}

function hashHeaderValue(value: string | null | undefined) {
  const salt = process.env.AFFILIATE_CLICK_SALT || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value || !salt) return undefined;
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}
