import "server-only";

import { unstable_cache } from "next/cache";
import { getCatalogMakeOptions } from "@/lib/makes/catalog";
import { sortCatalogLabels } from "@/lib/makes/catalog-order";
import { isSellerPaymentReady } from "@/lib/payments/stripe-connect-policy";
import {
  getUserPartShippingRestriction,
  isCurrentSellerAttestation,
} from "@/lib/parts/user-part-compliance-policy";
import { prisma } from "@/lib/prisma";

export type GaragePartListing = {
  id: string;
  title: string;
  description: string;
  brandId: string | null;
  brandName: string | null;
  manufacturerPartNumber: string | null;
  componentTypeId: string;
  componentLabel: string;
  condition: string;
  priceCents: number;
  quantity: number;
  mileageOnPart: number | null;
  includedHardware: string | null;
  knownDefects: string | null;
  shippingMode: string;
  shippingCostCents: number | null;
  shipsFromCity: string | null;
  shipsFromState: string | null;
  returnPolicy: string;
  universalFitment: boolean;
  shippingRestriction: string;
  sellerAttestationAccepted: boolean;
  status: string;
  images: Array<{ id: string; url: string; isPrimary: boolean; displayOrder: number }>;
  fitments: Array<{
    makeId: string;
    makeName: string;
    modelId: string;
    modelName: string;
    modelVariantId: string | null;
    yearStart: number | null;
    yearEnd: number | null;
    trim: string | null;
    engine: string | null;
    transmission: string | null;
    drivetrain: string | null;
    bodyStyle: string | null;
  }>;
};

export async function getGaragePartListings(userId: string, isOwner: boolean): Promise<GaragePartListing[]> {
  const rows = await prisma.userPartListing.findMany({
    where: {
      sellerId: userId,
      // Keep reserved inventory visible in the seller's public Garage. A
      // checkout reservation affects availability, not the listing's public
      // history; storefront search continues to return ACTIVE inventory only.
      status: isOwner ? { not: "REMOVED" } : { in: ["ACTIVE", "RESERVED"] },
    },
    select: {
      id: true,
      title: true,
      description: true,
      brandId: true,
      brandName: true,
      manufacturerPartNumber: true,
      componentTypeId: true,
      condition: true,
      priceCents: true,
      quantity: true,
      mileageOnPart: true,
      includedHardware: true,
      knownDefects: true,
      shippingMode: true,
      shippingCostCents: true,
      shipsFromCity: true,
      shipsFromState: true,
      returnPolicy: true,
      universalFitment: true,
      shippingRestriction: true,
      sellerAttestedAt: true,
      sellerPolicyVersion: true,
      status: true,
      componentType: { select: { name: true, category: { select: { name: true } } } },
      images: {
        where: { validationStatus: "VALID" },
        select: { id: true, url: true, isPrimary: true, displayOrder: true },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
      },
      fitments: {
        select: {
          makeId: true,
          modelId: true,
          modelVariantId: true,
          yearStart: true,
          yearEnd: true,
          trim: true,
          engine: true,
          transmission: true,
          drivetrain: true,
          bodyStyle: true,
          make: { select: { name: true } },
          model: { select: { name: true } },
        },
        orderBy: [{ make: { name: "asc" } }, { model: { name: "asc" } }],
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 60,
  });

  return rows.map((row) => ({
    ...row,
    sellerAttestationAccepted: isCurrentSellerAttestation(row),
    componentLabel: `${row.componentType.category.name} / ${row.componentType.name}`,
    fitments: row.fitments.map((fitment) => ({
      ...fitment,
      makeName: fitment.make.name,
      modelName: fitment.model.name,
    })),
  }));
}

const getSellerPartCatalogOptions = unstable_cache(
  async () => {
    const [makes, components, brands] = await Promise.all([
      getCatalogMakeOptions(),
      prisma.partComponentType.findMany({
        where: { active: true },
        select: { id: true, name: true, category: { select: { name: true } } },
        orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.partBrand.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
    ]);
    return {
      // The seller editor is a single select, so region grouping only makes
      // scanning harder. Keep this contract flat and alphabetic.
      makes: sortCatalogLabels(makes.map(({ id, name }) => ({ id, name }))),
      components: components.map((component) => ({
        id: component.id,
        name: component.name,
        label: `${component.category.name} / ${component.name}`,
        shippingRestriction: getUserPartShippingRestriction({
          componentName: component.name,
          categoryName: component.category.name,
        }),
      })),
      brands,
    };
  },
  ["seller-part-catalog-options-v2"],
  { revalidate: 86_400, tags: ["make-model-catalog", "parts-taxonomy"] },
);

export async function getGaragePartSellerContext(userId: string) {
  const [catalog, paymentAccount] = await Promise.all([
    getSellerPartCatalogOptions(),
    prisma.sellerPaymentAccount.findUnique({
      where: { userId },
      select: { onboardingStatus: true, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true },
    }),
  ]);
  return {
    ...catalog,
    paymentsReady: Boolean(paymentAccount && isSellerPaymentReady(paymentAccount)),
  };
}
