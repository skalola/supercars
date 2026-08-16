import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { reportServerError } from "@/lib/observability/error-reporting";
import { PartOfferList } from "@/components/parts/PartOfferList";
import { PartTypeCategorySelector } from "@/components/parts/PartTypeCategorySelector";
import { PartsVehicleHero } from "@/components/parts/PartsVehicleHero";
import { PartsWorkspaceShell } from "@/components/parts/PartsWorkspaceShell";
import { getVehiclePartTypeDetail } from "@/lib/parts/part-detail-service";
import { getPartsEngineeringRecommendation } from "@/lib/parts/engineering-recommendation-service";
import { getApplicablePartSystems, getApplicablePartTypes } from "@/lib/parts/vehicle-parts-service";

type PageProps = {
  params: Promise<{ make: string; model: string; partType: string }>;
  searchParams: Promise<{ system?: string | string[]; year?: string | string[]; vehicleId?: string | string[]; offerPage?: string | string[] }>;
};

export default async function VehiclePartTypePage({ params, searchParams }: PageProps) {
  const values = await params;
  const query = await searchParams;
  const session = await auth();
  const systemSlug = single(query.system);
  const year = parseYear(single(query.year));
  const vehicleId = single(query.vehicleId);
  const offerPage = parsePage(single(query.offerPage));
  const detail = await getVehiclePartTypeDetail({
    makeSlug: values.make,
    modelSlug: values.model,
    partTypeSlug: values.partType,
    systemSlug,
    year,
    vehicleId,
    offerPage,
    userId: session?.user?.id || null,
  });
  if (!detail) notFound();

  const [systems, initialPartTypes, engineeringRecommendation] = await Promise.all([
    getApplicablePartSystems({ makeSlug: detail.vehicle.make.slug, modelSlug: detail.vehicle.model.slug }),
    getApplicablePartTypes({
      makeSlug: detail.vehicle.make.slug,
      modelSlug: detail.vehicle.model.slug,
      systemSlug: detail.partType.system.slug,
    }),
    getPartsEngineeringRecommendation({
      makeSlug: detail.vehicle.make.slug,
      modelSlug: detail.vehicle.model.slug,
      vehicleId: detail.vehicle.exactOwnedVehicle ? detail.vehicle.id : null,
      userId: session?.user?.id || null,
      excludeComponentTypeId: detail.partType.id,
    }).catch((error) => {
      reportServerError(error, {
        route: "vehicle-part-type-page",
        makeSlug: detail.vehicle.make.slug,
        modelSlug: detail.vehicle.model.slug,
        operation: "engineering-recommendation",
      });
      return null;
    }),
  ]);

  const backParams = new URLSearchParams({ make: detail.vehicle.make.slug, model: detail.vehicle.model.slug });
  const changeVehicleParams = new URLSearchParams(backParams);
  changeVehicleParams.set("selectVehicle", "1");
  const vehicleDetailPath = detail.vehicle.exactOwnedVehicle && detail.vehicle.vin
    ? `/vehicle/${detail.vehicle.vin}`
    : `/make/${detail.vehicle.make.slug}/${detail.vehicle.model.slug}`;
  const offerPageParams = new URLSearchParams();
  offerPageParams.set("system", detail.partType.system.slug);
  if (detail.vehicle.year) offerPageParams.set("year", String(detail.vehicle.year));
  if (detail.vehicle.exactOwnedVehicle && detail.vehicle.id) offerPageParams.set("vehicleId", detail.vehicle.id);

  return (
    <PartsWorkspaceShell
      className="part-type-workspace-shell"
      contentClassName="part-type-detail-shell"
      contentLabel={`${detail.vehicle.make.name} ${detail.vehicle.model.name} parts`}
    >
      <nav className="part-type-detail-breadcrumbs" aria-label="Parts breadcrumb">
        <Link href={`/parts?${backParams}`}>Parts</Link>
        <span>/</span>
        <span>{detail.partType.system.name}</span>
        <span>/</span>
        <strong>{detail.partType.name}</strong>
      </nav>

      <PartsVehicleHero
        vehicle={{
          year: detail.vehicle.year,
          makeName: detail.vehicle.make.name,
          makeSlug: detail.vehicle.make.slug,
          makeLogoUrl: detail.vehicle.make.logoUrl,
          modelName: detail.vehicle.model.name,
          modelSlug: detail.vehicle.model.slug,
          variant: detail.vehicle.variant,
          imageUrl: detail.vehicle.imageUrl,
          engine: detail.vehicle.engine,
          horsepower: detail.performance.currentBuild.horsepowerMax,
          torque: detail.performance.currentBuild.torqueMax,
          weight: detail.performance.stock.weight,
          drivetrain: detail.vehicle.drivetrain,
          transmission: detail.vehicle.transmission,
          aspiration: getAspiration(detail.vehicle.engine),
          buildStage: detail.compatibility.label,
          detailPath: vehicleDetailPath,
          exactOwnedVehicle: detail.vehicle.exactOwnedVehicle,
        }}
        performanceAccent={{
          title: detail.partType.name,
          horsepowerGain: formatGainRange(detail.performance.selectedPartImpact.horsepowerGainMin, detail.performance.selectedPartImpact.horsepowerGainMax, "HP"),
          torqueGain: formatGainRange(detail.performance.selectedPartImpact.torqueGainMin, detail.performance.selectedPartImpact.torqueGainMax, "LB-FT"),
          evidence: detail.performance.selectedPartImpact.suppressedToPreventDoubleCount
            ? "Already represented in this build"
            : detail.performance.selectedPartImpact.confidence
              ? `${detail.performance.selectedPartImpact.confidence} evidence`
              : "Gain not documented",
          documented: detail.performance.selectedPartImpact.numericalEvidenceAvailable
            && !detail.performance.selectedPartImpact.suppressedToPreventDoubleCount,
        }}
        recommendationSummary={engineeringRecommendation ?? (detail.buildGuidance.nextUpgrade ? {
          title: detail.buildGuidance.nextUpgrade.name,
          summary: detail.buildGuidance.nextUpgrade.reason,
          href: detail.buildGuidance.nextUpgrade.href,
        } : {
          title: "Build your passport",
          summary: "Add installed modifications so the next balanced upgrade can be identified.",
        })}
        changeVehicleControl={<Link href={`/parts?${changeVehicleParams}`}>Change vehicle</Link>}
      />

      <PartTypeCategorySelector
        systems={systems}
        initialPartTypes={initialPartTypes}
        initialSystemSlug={detail.partType.system.slug}
        initialPartTypeSlug={detail.partType.slug}
        makeSlug={detail.vehicle.make.slug}
        modelSlug={detail.vehicle.model.slug}
        year={detail.vehicle.year}
        vehicleId={detail.vehicle.exactOwnedVehicle ? detail.vehicle.id : null}
      />

      <section className="part-type-available-section">
        <header>
          <div><span>Purchase Sources</span><h2>Available At</h2></div>
          <p>{detail.offerSummary.productCount.toLocaleString()} products on page {detail.offerSummary.pagination.page.toLocaleString()}</p>
        </header>
        {detail.availableAt.length === 0 ? (
          <div className="part-type-no-offers"><strong>No verified offers right now</strong><p>The vehicle intelligence above remains valid. Availability is refreshed when qualified supplier products are found.</p></div>
        ) : (
          <PartOfferList products={detail.availableAt} systemSlug={detail.partType.system.slug} />
        )}
        {detail.offerSummary.pagination.hasPrevious || detail.offerSummary.pagination.hasMore ? (
          <nav className="parts-pagination part-offer-pagination" aria-label="Available parts pages">
            {detail.offerSummary.pagination.hasPrevious ? (
              <Link href={offerPageHref(offerPageParams, detail.offerSummary.pagination.page - 1)} scroll={false}>Previous</Link>
            ) : <span className="is-disabled" aria-disabled="true">Previous</span>}
            <span>Page {detail.offerSummary.pagination.page.toLocaleString()}</span>
            {detail.offerSummary.pagination.hasMore ? (
              <Link href={offerPageHref(offerPageParams, detail.offerSummary.pagination.page + 1)} scroll={false}>Next</Link>
            ) : <span className="is-disabled" aria-disabled="true">Next</span>}
          </nav>
        ) : null}
        <p className="part-type-affiliate-disclosure">SUPERCAR DASH may earn a commission from qualifying purchases through partner links.</p>
      </section>
    </PartsWorkspaceShell>
  );
}

function single(value?: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function parseYear(value?: string) { const year = Number.parseInt(value || "", 10); return Number.isFinite(year) ? year : null; }
function parsePage(value?: string) { const page = Number.parseInt(value || "1", 10); return Number.isFinite(page) && page > 0 ? page : 1; }
function offerPageHref(baseParams: URLSearchParams, page: number) {
  const params = new URLSearchParams(baseParams);
  if (page > 1) params.set("offerPage", String(page));
  return `?${params.toString()}`;
}
function formatGainRange(min: number | null, max: number | null, suffix: string) { if (min == null || max == null) return "Not documented"; return min === max ? `+${min} ${suffix}` : `+${min}–${max} ${suffix}`; }
function getAspiration(engine?: string | null) { if (!engine) return null; return /turbo|supercharg/i.test(engine) ? "Forced Induction" : "Naturally Aspirated"; }
