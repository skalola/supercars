import type { Prisma } from "@prisma/client";

const testTextMarkers = [
  "sprint",
  "test",
  "audit",
  "payment test",
  "dummy",
  "shiv's autoshop",
  "dealer partner",
];

const testEmailMarkers = [
  "supercars.market",
  "supercars.test",
  "example.com",
  "example.test",
];

const testVinMarkers = ["TEST", "SERV", "TRAN"];

export const realFulfillmentWhere: Prisma.FulfillmentRequestWhereInput = {
  NOT: {
    OR: [
      ...testTextMarkers.flatMap((marker) => [
        { notes: { contains: marker, mode: "insensitive" as const } },
        { parties: { some: { name: { contains: marker, mode: "insensitive" as const } } } },
        { parties: { some: { companyName: { contains: marker, mode: "insensitive" as const } } } },
        { listing: { dealerName: { contains: marker, mode: "insensitive" as const } } },
        { listing: { source: { name: { contains: marker, mode: "insensitive" as const } } } },
      ]),
      ...testEmailMarkers.map((marker) => ({
        parties: { some: { email: { contains: marker, mode: "insensitive" as const } } },
      })),
      ...testVinMarkers.map((marker) => ({
        vehicle: { vin: { contains: marker, mode: "insensitive" as const } },
      })),
    ],
  },
};

export function withRealFulfillmentWhere(
  where: Prisma.FulfillmentRequestWhereInput = {}
): Prisma.FulfillmentRequestWhereInput {
  return {
    AND: [realFulfillmentWhere, where],
  };
}
