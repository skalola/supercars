import { prisma } from "@/lib/prisma";

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
      OR: [
        { compatibility: { none: {} } },
        {
          compatibility: {
            some: {
              AND: [
                {
                  OR: [
                    { makeId: null },
                    { makeId: vehicle.model.makeId },
                  ],
                },
                {
                  OR: [
                    { modelId: null },
                    { modelId: vehicle.modelId },
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
        },
      ],
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
