import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import VehicleEditorForm from "./VehicleEditorForm";
import { getManualPartBrandOptions, getManualPartTypeGroups } from "@/lib/parts/manual-part-options";

type EditPageProps = {
  params: Promise<{ vin: string }>;
};

const vehicleEditSelect = {
  id: true,
  vin: true,
  year: true,
  ownerId: true,
  status: true,
  mileage: true,
  engineHP: true,
  model: {
    select: {
      name: true,
      make: { select: { name: true } },
      spec: {
        select: {
          horsepower: true,
          torque: true,
        },
      },
    },
  },
  profile: {
    select: {
      exteriorColor: true,
      interiorColor: true,
      currentMileage: true,
      ownerNotes: true,
    },
  },
  modifications: {
    select: {
      id: true,
      name: true,
      brand: true,
      description: true,
      installedDate: true,
      catalogInstall: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  },
  installedParts: {
    select: {
      id: true,
      legacyModificationId: true,
      customName: true,
      customBrandName: true,
      installedDate: true,
      notes: true,
      hpGainOverride: true,
      torqueGainOverride: true,
      part: {
        select: {
          name: true,
          estimatedHpGain: true,
          estimatedTorqueGain: true,
          category: { select: { name: true } },
          brand: { select: { name: true } },
        },
      },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  },
  serviceRecords: {
    select: {
      id: true,
      serviceDate: true,
      mileage: true,
      shopName: true,
      description: true,
      cost: true,
    },
    orderBy: { serviceDate: "desc" },
    take: 100,
  },
  awards: {
    select: {
      id: true,
      title: true,
      eventName: true,
      awardDate: true,
      description: true,
    },
    orderBy: { awardDate: "desc" },
    take: 100,
  },
  photos: {
    select: {
      id: true,
      filePath: true,
      caption: true,
      isHero: true,
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    take: 100,
  },
  documents: {
    select: {
      id: true,
      title: true,
      documentType: true,
      filePath: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  },
} satisfies Prisma.VehicleSelect;

export default async function VehicleEditPage({ params }: EditPageProps) {
  const { vin } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    select: vehicleEditSelect,
  });

  // Verify ownership
  if (!vehicle || vehicle.ownerId !== userId || vehicle.status !== "CLAIMED") {
    redirect(`/vehicle/${vin}`);
  }

  const [partCategories, partBrands] = await Promise.all([
    prisma.partCategory.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: [
        { displayOrder: "asc" },
        { name: "asc" },
      ],
    }),
    prisma.partBrand.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const manualBrandOptions = getManualPartBrandOptions(partBrands.map((brand) => brand.name));
  const manualPartTypeGroups = getManualPartTypeGroups(partCategories);

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: "#111827" }}>
            Edit Passport
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: 15 }}>
            {vehicle.model.make.name} {vehicle.model.name} ({vehicle.year})
          </p>
        </div>

        <Link href={`/vehicle/${vin}`} style={{
          fontSize: "14px",
          color: "#4b5563",
          fontWeight: 600,
          textDecoration: "none",
          border: "1px solid #d1d5db",
          padding: "8px 16px",
          borderRadius: "8px",
          transition: "all 0.2s"
        }}>
          ← Back to Passport
        </Link>
      </div>

      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <VehicleEditorForm
          vehicle={vehicle}
          partCategories={partCategories}
          manualBrandOptions={manualBrandOptions}
          manualPartTypeGroups={manualPartTypeGroups}
        />
      </div>
    </main>
  );
}
