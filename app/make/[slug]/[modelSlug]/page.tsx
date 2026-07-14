import Link from "next/link";
import Image from "next/image";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toggleGarageItem } from "@/app/actions/garage";

function getHeroImage(images: Array<{ url: string; type: string | null; source: string | null }>) {
  return images.find((image) => image.type === "hero")?.url ?? images[0]?.url ?? null;
}

type ModelPageProps = {
  params: Promise<{
    slug: string;
    modelSlug: string;
  }>;
};

function formatYears(startYear: number | null, endYear: number | null) {
  if (!startYear) {
    return "Production years unavailable";
  }

  return endYear ? `${startYear} - ${endYear}` : `${startYear} - present`;
}

function formatCount(count: number | null) {
  if (!count) {
    return "Not published";
  }

  return count.toLocaleString();
}

type ModelDetail = {
  id: string;
  makeId: string;
  name: string;
  slug: string;
  years: string | null;
  productionStartYear: number | null;
  productionEndYear: number | null;
  category: string | null;
  bodyStyle: string | null;
  productionCount: number | null;
  description: string | null;
  make: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  };
  spec: {
    id: string;
    modelId: string;
    engine: string | null;
    displacement: string | null;
    cylinders: string | null;
    horsepower: string | null;
    torque: string | null;
    transmission: string | null;
    drivetrain: string | null;
    topSpeed: string | null;
    zeroToSixty: string | null;
    weight: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  variants: Array<{
    id: string;
    modelId: string;
    name: string;
    slug: string;
    productionStartYear: number | null;
    productionEndYear: number | null;
    productionCount: number | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  images: Array<{
    id: string;
    modelId: string;
    url: string;
    source: string | null;
    type: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  vehicles: Array<{
    id: string;
    vin: string;
    modelId: string;
    year: number;
    color: string | null;
    mileage: number | null;
    transmission: string | null;
    drivetrain: string | null;
    engine: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export default async function ModelPage({ params }: ModelPageProps) {
  const { slug, modelSlug } = await params;
  const session = await auth();

  const make = await prisma.make.findUnique({
    where: { slug },
  });

  if (!make) {
    return <div style={{ padding: 40 }}>Make not found</div>;
  }

  const model = (await prisma.model.findUnique({
    where: {
      makeId_slug: {
        makeId: make.id,
        slug: modelSlug,
      },
    },
    include: {
      make: true,
      variants: {
        orderBy: [{ productionStartYear: "asc" }, { name: "asc" }],
      },
      images: {
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      },
      vehicles: {
        orderBy: [{ year: "asc" }, { vin: "asc" }],
      },
    },
  })) as ModelDetail | null;

  if (!model) {
    return <div style={{ padding: 40 }}>Model not found</div>;
  }

  const [spec, modelImages] = await Promise.all([
    prisma.modelSpec.findUnique({
      where: { modelId: model.id },
    }),
    prisma.modelImage.findMany({
      where: { modelId: model.id },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const garageItem = session?.user ? await prisma.garageItem.findUnique({
    where: {
      userId_modelId: {
        userId: session.user.id as string,
        modelId: model.id,
      },
    },
  }) : null;

  const claimedVehicle = session?.user ? await prisma.vehicle.findFirst({
    where: {
      modelId: model.id,
      ownerId: session.user.id as string,
    },
  }) : null;

  const heroImage = getHeroImage(modelImages);

  const specs = [
    ["Engine", spec?.engine],
    ["Displacement", spec?.displacement],
    ["Cylinders", spec?.cylinders],
    ["Horsepower", spec?.horsepower],
    ["Torque", spec?.torque],
    ["Transmission", spec?.transmission],
    ["Drivetrain", spec?.drivetrain],
    ["Top speed", spec?.topSpeed],
    ["0-60 mph", spec?.zeroToSixty],
    ["Weight", spec?.weight],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <main
      style={{
        padding: 40,
        fontFamily: "system-ui",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <Link
        href={`/make/${model.make.slug}`}
        style={{ color: "#555", textDecoration: "none" }}
      >
        {model.make.name}
      </Link>

      <h1 style={{ fontSize: 52, margin: "12px 0 8px" }}>{model.name}</h1>

      <div style={{ marginTop: 20, display: "grid", gap: 20 }}>
        {heroImage ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              background: "#f8fafc",
            }}
          >
            <Image
              src={heroImage}
              alt={`${model.make.name} ${model.name}`}
              fill
              sizes="(max-width: 768px) 100vw, 75vw"
              style={{ objectFit: "cover" }}
              unoptimized
            />
            <form action={async () => {
              "use server";
              if (!session?.user?.id) {
                await signIn("google", { redirectTo: `/make/${slug}/${modelSlug}` });
                return;
              }
              await toggleGarageItem(model.id);
            }} style={{ position: "absolute", top: 12, right: 12 }}>
              <button
                type="submit"
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 12px",
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                }}
              >
                {session?.user?.id && garageItem ? "Remove from My Garage" : "Add to My Garage"}
              </button>
            </form>
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "linear-gradient(135deg, #0f172a, #1d4ed8)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{model.make.name}</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>{model.name}</div>
              <div style={{ marginTop: 10, color: "#cbd5e1" }}>Placeholder image coming soon</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, padding: 20, border: "1px solid #e5e7eb", borderRadius: 12, background: "#f9fafb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, color: "#666", fontWeight: 600 }}>Ownership</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {claimedVehicle ? (
                <span style={{ color: claimedVehicle.status === "CLAIMED" ? "#059669" : "#d97706" }}>
                  {claimedVehicle.status === "CLAIMED" ? "CLAIMED" : "CLAIM PENDING"}
                </span>
              ) : garageItem ? (
                <span style={{ color: "#666" }}>In My Garage</span>
              ) : (
                "Not Claimed"
              )}
            </div>
          </div>
          {session?.user && garageItem && !claimedVehicle && (
            <Link 
              href={`/claim/${model.id}`}
              style={{ 
                padding: "8px 16px", 
                background: "#000", 
                color: "#fff", 
                borderRadius: 8, 
                textDecoration: "none", 
                fontSize: 14, 
                fontWeight: 600 
              }}
            >
              Claim This Vehicle
            </Link>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginTop: 28,
        }}

      >
        <div>
          <div style={{ color: "#777", fontSize: 13 }}>Production years</div>
          <strong>
            {formatYears(model.productionStartYear, model.productionEndYear)}
          </strong>
        </div>
        <div>
          <div style={{ color: "#777", fontSize: 13 }}>Category</div>
          <strong>{model.category ?? "Uncategorized"}</strong>
        </div>
        <div>
          <div style={{ color: "#777", fontSize: 13 }}>Body style</div>
          <strong>{model.bodyStyle ?? "Unavailable"}</strong>
        </div>
        <div>
          <div style={{ color: "#777", fontSize: 13 }}>Production count</div>
          <strong>{formatCount(model.productionCount)}</strong>
        </div>
      </div>

      {model.description ? (
        <section style={{ marginTop: 36 }}>
          <h2>History</h2>
          <p style={{ color: "#333", fontSize: 18, lineHeight: 1.65 }}>
            {model.description}
          </p>
        </section>
      ) : null}

      {model.variants.length > 0 ? (
        <section style={{ marginTop: 36 }}>
          <h2>Variants</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {model.variants.map((variant) => (
              <div
                key={variant.id}
                style={{
                  border: "1px solid #e8e8e8",
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <h3 style={{ margin: "0 0 8px" }}>{variant.name}</h3>
                <div style={{ color: "#777", fontSize: 13 }}>
                  {formatYears(
                    variant.productionStartYear,
                    variant.productionEndYear,
                  )}
                </div>
                {variant.productionCount ? (
                  <div style={{ color: "#777", fontSize: 13, marginTop: 4 }}>
                    {variant.productionCount.toLocaleString()} built
                  </div>
                ) : null}
                {variant.description ? (
                  <p style={{ color: "#333", lineHeight: 1.5 }}>
                    {variant.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {specs.length > 0 ? (
        <section style={{ marginTop: 36 }}>
          <h2>Performance specifications</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {specs.map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid #e8e8e8",
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ color: "#777", fontSize: 13 }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: 36 }}>
        <h2>Vehicles</h2>

        {model.vehicles.length > 0 ? (
          model.vehicles.map((vehicle) => (
            <div key={vehicle.id}>
              <Link href={`/vehicle/${vehicle.vin}`}>
                {vehicle.year} {vehicle.color} - {vehicle.vin}
              </Link>
            </div>
          ))
        ) : (
          <p style={{ color: "#777" }}>No VIN-level vehicles recorded yet.</p>
        )}
      </section>

      {claimedVehicle && claimedVehicle.status === "CLAIMED" && (
        <section style={{ marginTop: 48, padding: 32, background: "#f8fafc", borderRadius: 24, border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>Owner Dashboard</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              "Market Price",
              "Inspection Report",
              "Service History",
              "Upcoming Maintenance",
              "Awards",
              "List Vehicle For Sale",
              "Book Service",
            ].map((item) => (
              <div key={item} style={{ padding: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{item}</div>
                <div style={{ color: "#94a3b8", fontSize: 14 }}>Coming Soon</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
