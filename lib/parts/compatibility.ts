import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type VehicleFitmentTarget = {
  year: number;
  modelId: string;
  model: {
    makeId: string;
  };
};

export function getExplicitPartCompatibilityWhereForVehicle(vehicle: VehicleFitmentTarget): Prisma.PerformancePartWhereInput {
  return {
    compatibility: {
      some: getExplicitCompatibilityScopeForVehicle(vehicle),
    },
  };
}

export function getExplicitCompatibilityScopeForVehicle(
  vehicle: VehicleFitmentTarget,
): Prisma.PartCompatibilityWhereInput {
  return {
    AND: [
      {
        OR: [
          { modelId: vehicle.modelId },
          {
            AND: [
              { modelId: null },
              { makeId: vehicle.model.makeId },
            ],
          },
        ],
      },
      {
        OR: [
          { yearStart: null },
          { yearStart: { lte: vehicle.year } },
        ],
      },
      {
        OR: [
          { yearEnd: null },
          { yearEnd: { gte: vehicle.year } },
        ],
      },
    ],
  };
}

export async function getCompatiblePerformancePartsForVehicle(vehicle: {
  year: number;
  modelId: string;
  model: {
    makeId: string;
  };
}) {
  const parts = await prisma.performancePart.findMany({
    where: {
      status: { in: ["ACTIVE", "MANUAL_REVIEW"] },
      ...getExplicitPartCompatibilityWhereForVehicle(vehicle),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      partNumber: true,
      description: true,
      imageUrl: true,
      sourceUrl: true,
      sourceConfidence: true,
      status: true,
      retailPriceCents: true,
      estimatedHpGain: true,
      estimatedTorqueGain: true,
      categoryId: true,
      brandId: true,
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      brand: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      compatibility: {
        select: {
          makeId: true,
          modelId: true,
          yearStart: true,
          yearEnd: true,
          trim: true,
          engine: true,
          make: {
            select: {
              name: true,
            },
          },
          model: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 12,
      },
    },
    orderBy: [
      { category: { displayOrder: "asc" } },
      { brand: { name: "asc" } },
      { name: "asc" },
    ],
    take: 50,
  });

  return parts;
}
