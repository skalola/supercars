import type { Prisma } from "@prisma/client";

export const realValidatedListingWhere: Prisma.ListingWhereInput = {
  status: "ACTIVE",
  validationStatus: "VALID",
  vinVerified: true,
  sellerId: null,
  sourceId: { not: null },
  url: { not: null },
  externalListingId: { not: null },
  AND: [
    { NOT: { externalListingId: { contains: "sprint-", mode: "insensitive" } } },
    { NOT: { externalListingId: { contains: "admin-ops", mode: "insensitive" } } },
    { NOT: { externalListingId: { contains: "demo", mode: "insensitive" } } },
    { NOT: { externalListingId: { contains: "test", mode: "insensitive" } } },
    { NOT: { url: { contains: "example.test", mode: "insensitive" } } },
    { NOT: { url: { contains: "example.org", mode: "insensitive" } } },
    { NOT: { url: { contains: "admin-ops-test", mode: "insensitive" } } },
    { NOT: { source: { name: { contains: "test", mode: "insensitive" } } } },
    { NOT: { source: { name: { contains: "demo", mode: "insensitive" } } } },
    { NOT: { source: { name: { contains: "sprint", mode: "insensitive" } } } },
  ],
};
