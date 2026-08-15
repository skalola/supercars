import { NextResponse } from "next/server";
import { refreshFerrariEbayOffers } from "@/lib/parts/offer-refresh";
import { discoverFerrariParts } from "@/lib/parts/ferrari-discovery";
import { prisma } from "@/lib/prisma";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { prepareFerrariZeroOfferRecovery } from "@/lib/parts/zero-offer-recovery";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const canonicalOfferRefresh = await refreshFerrariEbayOffers(prisma, { limit: 50, staleBefore });
  const recoveryMappingIds = await prepareFerrariZeroOfferRecovery(prisma, 25);
  const componentDiscovery = await discoverFerrariParts(prisma, {
    maxQueries: 25,
    resultsPerQuery: 10,
    delayMs: 150,
    refreshHours: 168,
    maxRetries: 2,
    mappingIds: recoveryMappingIds,
    exhaustiveRecovery: true,
  });
  return NextResponse.json({ ok: true, canonicalOfferRefresh, recoveryQueued: recoveryMappingIds.length, componentDiscovery });
}
