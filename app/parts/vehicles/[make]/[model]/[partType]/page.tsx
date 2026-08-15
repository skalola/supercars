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
  searchParams: Promise<{ system?: string | string[]; year?: string | string[]; vehicleId?: string | string[] }>;
};

export default async function VehiclePartTypePage({ params, searchParams }: PageProps) {
  const values = await params;
  const query = await searchParams;
  const session = await auth();
  const systemSlug = single(query.system);
  const year = parseYear(single(query.year));
  const vehicleId = single(query.vehicleId);
  const detail = await getVehiclePartTypeDetail({
    makeSlug: values.make,
    modelSlug: values.model,
    partTypeSlug: values.partType,
    systemSlug,
    year,
    vehicleId,
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
  const hasRelationships = detail.relationships.requires.length > 0
    || detail.relationships.recommendedWith.length > 0
    || detail.relationships.conflictsWith.length > 0;
  const vehicleDetailPath = detail.vehicle.exactOwnedVehicle && detail.vehicle.vin
    ? `/vehicle/${detail.vehicle.vin}`
    : `/make/${detail.vehicle.make.slug}/${detail.vehicle.model.slug}`;

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
        changeVehicleControl={<Link href={`/parts?${backParams}`}>Change vehicle</Link>}
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

      {hasRelationships ? (
        <section className="part-type-detail-grid is-support-only">
          <div className="part-type-detail-main">
            <article className="part-type-support-panel">
              <div className="part-type-panel-heading"><div><span>Build Requirements</span><h2>Works With</h2></div></div>
              <RelationshipRows label="Requires" items={detail.relationships.requires} />
              <RelationshipRows label="Recommended With" items={detail.relationships.recommendedWith} />
              <RelationshipRows label="Conflicts With" items={detail.relationships.conflictsWith} />
            </article>
          </div>
        </section>
      ) : null}

      <section className="part-type-available-section">
        <header>
          <div><span>Purchase Sources</span><h2>Available At</h2></div>
          <p>{detail.offerSummary.productCount.toLocaleString()} products across {detail.offerSummary.providerCount.toLocaleString()} providers</p>
        </header>
        {detail.availableAt.length === 0 ? (
          <div className="part-type-no-offers"><strong>No verified offers right now</strong><p>The vehicle intelligence above remains valid. Availability is refreshed when qualified supplier products are found.</p></div>
        ) : (
          <PartOfferList products={detail.availableAt} systemSlug={detail.partType.system.slug} />
        )}
        <p className="part-type-affiliate-disclosure">SUPERCAR DASH may earn a commission from qualifying purchases through partner links.</p>
      </section>
    </PartsWorkspaceShell>
  );
}

function RelationshipRows({ label, items }: { label: string; items: Array<{ partType: { id: string; name: string }; reason?: string | null }> }) {
  if (items.length === 0) return null;
  return <div className="part-type-relationship-row"><strong>{label}</strong><div>{items.map((item) => <span key={item.partType.id} title={item.reason || undefined}>{item.partType.name}</span>)}</div></div>;
}

function single(value?: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function parseYear(value?: string) { const year = Number.parseInt(value || "", 10); return Number.isFinite(year) ? year : null; }
function formatGainRange(min: number | null, max: number | null, suffix: string) { if (min == null || max == null) return "Not documented"; return min === max ? `+${min} ${suffix}` : `+${min}–${max} ${suffix}`; }
function getAspiration(engine?: string | null) { if (!engine) return null; return /turbo|supercharg/i.test(engine) ? "Forced Induction" : "Naturally Aspirated"; }
