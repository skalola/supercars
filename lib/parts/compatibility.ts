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
      some: {
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
      },
    },
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
    include: {
      category: true,
      brand: true,
      compatibility: {
        include: {
          make: true,
          model: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [
      { category: { displayOrder: "asc" } },
      { brand: { name: "asc" } },
      { name: "asc" },
    ],
  });

  return parts;
}
