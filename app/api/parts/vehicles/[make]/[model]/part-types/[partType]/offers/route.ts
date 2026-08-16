import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { partDiscoveryRequestSchema } from "@/lib/parts/discovery-contract";
import { resolvePartDiscoveryContext } from "@/lib/parts/discovery-context";
import { getAvailableOffers } from "@/lib/parts/vehicle-parts-service";
import {
  enforceActionRateLimit,
  hashRateLimitIdentifier,
  isActionRateLimitError,
} from "@/lib/security/action-rate-limit";

type RouteParams = { params: Promise<{ make: string; model: string; partType: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const context = await readGetContext(request, params);
  if (!context) return NextResponse.json({ error: "Parts context is invalid." }, { status: 400 });

  const result = await getAvailableOffers({ ...context, cacheOnly: true });
  if (!result) return NextResponse.json({ error: "Vehicle part type mapping not found." }, { status: 404 });
  return NextResponse.json(result, { headers: cacheHeaders(result.offers.length) });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-site discovery requests are not allowed." }, { status: 403 });
  }

  const values = await params;
  const makeSlug = clean(values.make);
  const modelSlug = clean(values.model);
  const componentSlug = clean(values.partType);
  const payload = await request.json().catch(() => null);
  const parsed = partDiscoveryRequestSchema.safeParse(payload);
  if (!makeSlug || !modelSlug || !componentSlug || !parsed.success) {
    return NextResponse.json({ error: "Parts context is invalid." }, { status: 400 });
  }

  try {
    const contextResult = await resolvePartDiscoveryContext({
      makeSlug,
      modelSlug,
      systemSlug: parsed.data.systemSlug,
      componentSlug,
    });
    if (!contextResult.ok) {
      const status = contextResult.code === "NOT_FOUND" ? 404 : contextResult.code === "MAPPING_DISABLED" ? 409 : 422;
      return NextResponse.json({ error: contextResult.message, code: contextResult.code, applicability: contextResult.applicability }, { status });
    }

    const offerContext = {
      makeSlug: contextResult.vehicle.makeSlug,
      modelSlug: contextResult.vehicle.modelSlug,
      componentSlug: contextResult.partType.componentSlug,
      categorySlug: contextResult.partType.systemSlug,
      year: parsed.data.year ?? null,
      page: 1,
    };
    let result = await getAvailableOffers({ ...offerContext, cacheOnly: true });
    if (!result) return NextResponse.json({ error: "Part discovery context could not be created." }, { status: 500 });

    const lastSearchedAt = result.cache.lastSearchedAt ? new Date(result.cache.lastSearchedAt).getTime() : 0;
    const stale = Date.now() - lastSearchedAt > result.cache.ttlSeconds * 1_000;
    const needsImmediateDiscovery = result.offers.length === 0 && result.cache.status !== "RUNNING";
    if (needsImmediateDiscovery || (stale && result.cache.status !== "RUNNING")) {
      await enforceDiscoveryRateLimit(request);
    }

    if (needsImmediateDiscovery) {
      result = await getAvailableOffers({ ...offerContext, forceRefresh: true }) ?? result;
    } else if (stale && result.cache.status !== "RUNNING") {
      after(async () => {
        try {
          await getAvailableOffers({ ...offerContext, forceRefresh: true });
        } catch (error) {
          console.error("Background part offer refresh failed", { makeSlug, modelSlug, componentSlug, error });
        }
      });
    }

    return NextResponse.json({
      ready: true,
      offerCount: result.pagination.total,
      cache: result.cache,
      context: {
        mappingId: contextResult.mappingId,
        created: contextResult.created,
        applicability: contextResult.applicability,
      },
    }, { headers: cacheHeaders(result.offers.length) });
  } catch (error) {
    if (isActionRateLimitError(error)) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Part offer discovery failed", { makeSlug, modelSlug, componentSlug, error });
    return NextResponse.json({ error: "Live offers are temporarily unavailable." }, { status: 502 });
  }
}

async function readGetContext(request: NextRequest, params: RouteParams["params"]) {
  const values = await params;
  const makeSlug = clean(values.make);
  const modelSlug = clean(values.model);
  const componentSlug = clean(values.partType);
  const categorySlug = clean(request.nextUrl.searchParams.get("system") || "");
  if (!makeSlug || !modelSlug || !componentSlug || !categorySlug) return null;
  const parsedYear = Number.parseInt(request.nextUrl.searchParams.get("year") || "", 10);
  const year = Number.isFinite(parsedYear) && parsedYear >= 1886 && parsedYear <= new Date().getFullYear() + 2 ? parsedYear : null;
  const parsedPage = Number.parseInt(request.nextUrl.searchParams.get("page") || "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  return { makeSlug, modelSlug, componentSlug, categorySlug, year, page };
}

async function enforceDiscoveryRateLimit(request: Request) {
  const session = await auth();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) || "unknown";
  const actorId = session?.user?.id || hashRateLimitIdentifier(`${forwardedFor}|${userAgent}`);
  await enforceActionRateLimit({
    actorId,
    action: "parts_offer_discovery",
    bucketKey: "GLOBAL",
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function cacheHeaders(offerCount: number) {
  return {
    "Cache-Control": offerCount > 0
      ? "private, max-age=0, stale-while-revalidate=300"
      : "private, no-store, max-age=0",
  };
}

function clean(value: string) {
  const cleaned = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(cleaned) ? cleaned : "";
}
