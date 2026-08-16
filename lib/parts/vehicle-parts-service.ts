import type { PrismaClient } from "@prisma/client";
import {
  getApplicablePartSystems,
  getApplicablePartTypes,
  getAvailableOffers,
  getPartModels,
  getPartVehicleSummary,
} from "@/lib/parts/ferrari-component-service";
import { rankPartOffers } from "@/lib/parts/offer-ranking";
import { getPreferredPartBrandsForComponent } from "@/lib/parts/preferred-brands";

export type VehiclePartsContext = {
  makeId?: string;
  makeSlug: string;
  makeName?: string;
  modelId?: string;
  modelSlug: string;
  modelName?: string;
  year?: number | null;
  variantId?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
};

export { getApplicablePartSystems, getApplicablePartTypes, getAvailableOffers, getPartModels, getPartVehicleSummary };

export async function getPreferredBrands(
  prisma: PrismaClient,
  vehicleContext: VehiclePartsContext,
  partTypeId: string,
) {
  const partType = await prisma.partComponentType.findFirst({
    where: {
      id: partTypeId,
      active: true,
      modelMappings: {
        some: {
          active: true,
          model: {
            slug: vehicleContext.modelSlug,
            make: { slug: vehicleContext.makeSlug },
          },
        },
      },
    },
    select: { id: true, categoryId: true },
  });
  if (!partType) return [];

  const resolvedVehicle = vehicleContext.makeId && vehicleContext.modelId
    ? { makeId: vehicleContext.makeId, modelId: vehicleContext.modelId }
    : await prisma.model.findFirst({
      where: {
        slug: vehicleContext.modelSlug,
        make: { slug: vehicleContext.makeSlug },
      },
      select: { id: true, makeId: true },
    }).then((model) => model ? { makeId: model.makeId, modelId: model.id } : null);
  if (!resolvedVehicle) return [];

  return getPreferredPartBrandsForComponent(prisma, {
    makeId: resolvedVehicle.makeId,
    modelId: resolvedVehicle.modelId,
    categoryId: partType.categoryId,
    componentTypeId: partType.id,
  });
}

export function rankOffers<T extends Parameters<typeof rankPartOffers>[0]["offers"][number]>(input: {
  vehicleContext: VehiclePartsContext;
  partTypeId: string;
  offers: T[];
  preferredBrands?: Parameters<typeof rankPartOffers>[0]["preferredBrands"];
}) {
  return rankPartOffers({ offers: input.offers, preferredBrands: input.preferredBrands });
}
