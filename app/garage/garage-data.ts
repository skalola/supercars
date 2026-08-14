import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNextMaintenanceRecommendation } from "@/lib/maintenance/recommendations";
import {
  getClaimedVehicleServiceRecordSummaries,
  groupServiceRecordsByVehicle,
} from "@/lib/maintenance/service-record-summaries";
import type { GarageClaimedVehicle, GaragePreviousVehicle, GarageSavedVehicle } from "./GarageTabs";
import type { GarageRecentActivityItem, GarageServiceWatchItem } from "./GarageSupportRail";
import { getGarageClubSummary } from "./garage-clubs";
import { getGarageMeetActivity } from "./garage-meets";
import { getGarageStats } from "./garage-stats";

const garageClaimedVehicleSelect = {
  id: true,
  vin: true,
  modelId: true,
  year: true,
  status: true,
  mileage: true,
  trim: true,
  createdAt: true,
  model: {
    select: {
      name: true,
      slug: true,
      make: {
        select: {
          name: true,
          slug: true,
          logoUrl: true,
        },
      },
      maintenanceRules: {
        select: {
          id: true,
          serviceName: true,
          description: true,
          intervalMiles: true,
          intervalMonths: true,
          priority: true,
        },
      },
      spec: {
        select: {
          horsepower: true,
        },
      },
      images: {
        select: { url: true },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
  },
  photos: {
    select: { filePath: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
  },
  images: {
    select: { url: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    take: 1,
  },
  _count: {
    select: { modifications: true },
  },
  listings: {
    where: {
      status: "ACTIVE",
      OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
    },
    select: { askingPrice: true, price: true },
    take: 1,
  },
} satisfies Prisma.VehicleSelect;

const garagePreviousVehicleSelect = {
  id: true,
  vin: true,
  year: true,
  status: true,
  mileage: true,
  trim: true,
  model: {
    select: {
      name: true,
      slug: true,
      make: {
        select: {
          name: true,
          slug: true,
          logoUrl: true,
        },
      },
      images: {
        select: { url: true },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
  },
  photos: {
    select: { filePath: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
  },
  images: {
    select: { url: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    take: 1,
  },
  listings: {
    where: {
      OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
    },
    select: { askingPrice: true, price: true },
    orderBy: { updatedAt: "desc" },
    take: 1,
  },
} satisfies Prisma.VehicleSelect;

const garageItemSelect = {
  id: true,
  modelId: true,
  priceTrackerAlertsEnabled: true,
  listingTrackerAlertsEnabled: true,
  createdAt: true,
  model: {
    select: {
      name: true,
      slug: true,
      years: true,
      make: {
        select: {
          name: true,
          slug: true,
          logoUrl: true,
        },
      },
      images: {
        select: { url: true },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
  },
} satisfies Prisma.GarageItemSelect;

export type GarageClaimedVehicleRow = Prisma.VehicleGetPayload<{ select: typeof garageClaimedVehicleSelect }>;
export type GaragePreviousVehicleRow = Prisma.VehicleGetPayload<{ select: typeof garagePreviousVehicleSelect }>;
export type GarageItemRow = Prisma.GarageItemGetPayload<{ select: typeof garageItemSelect }>;

export async function getGarageDashboardData(userId: string, includePendingClubs: boolean) {
  const [claimedVehicleRows, previousVehicleRows, garageItems, meetActivity, clubSummary, serviceRecordSummaries] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        ownerId: userId,
        status: "CLAIMED",
      },
      select: garageClaimedVehicleSelect,
      orderBy: { createdAt: "desc" },
      take: 48,
    }),
    prisma.vehicle.findMany({
      where: {
        ownerId: userId,
        status: { not: "CLAIMED" },
      },
      select: garagePreviousVehicleSelect,
      orderBy: { updatedAt: "desc" },
      take: 48,
    }),
    prisma.garageItem.findMany({
      where: { userId },
      select: garageItemSelect,
      orderBy: { createdAt: "desc" },
      take: 96,
    }),
    getGarageMeetActivity(userId),
    getGarageClubSummary(userId, includePendingClubs),
    getClaimedVehicleServiceRecordSummaries(userId),
  ]);

  const claimedModelIds = new Set(claimedVehicleRows.map((vehicle) => vehicle.modelId));
  const claimedVehicles = claimedVehicleRows.map(toClaimedVehicle);
  const savedVehicles = garageItems
    .filter((item) => !claimedModelIds.has(item.modelId))
    .map(toSavedVehicle);
  const previousVehicles = previousVehicleRows.map(toPreviousVehicle);
  const totalVehicles = claimedVehicles.length + savedVehicles.length;

  return {
    clubSummary,
    claimedVehicles,
    savedVehicles,
    previousVehicles,
    garageStats: getGarageStats(claimedVehicleRows, totalVehicles),
    serviceWatch: getGarageServiceWatch(claimedVehicleRows, groupServiceRecordsByVehicle(serviceRecordSummaries)),
    recentActivity: getRecentGarageActivity(claimedVehicleRows, garageItems, meetActivity),
  };
}

function toClaimedVehicle(vehicle: GarageClaimedVehicleRow): GarageClaimedVehicle {
  return {
    id: vehicle.id,
    vin: vehicle.vin,
    year: vehicle.year,
    status: vehicle.status,
    mileage: vehicle.mileage,
    image: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
    makeLogoUrl: vehicle.model.make.logoUrl,
    makeName: vehicle.model.make.name,
    makeSlug: vehicle.model.make.slug,
    modelName: vehicle.model.name,
    modelSlug: vehicle.model.slug,
    trim: vehicle.trim,
    estimatedValue: vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? null,
  };
}

function toPreviousVehicle(vehicle: GaragePreviousVehicleRow): GaragePreviousVehicle {
  return {
    id: vehicle.id,
    vin: vehicle.vin,
    year: vehicle.year,
    status: vehicle.status,
    mileage: vehicle.mileage,
    image: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
    makeLogoUrl: vehicle.model.make.logoUrl,
    makeName: vehicle.model.make.name,
    makeSlug: vehicle.model.make.slug,
    modelName: vehicle.model.name,
    modelSlug: vehicle.model.slug,
    trim: vehicle.trim,
    estimatedValue: vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? null,
  };
}

function toSavedVehicle(item: GarageItemRow): GarageSavedVehicle {
  return {
    id: item.id,
    image: item.model.images[0]?.url || null,
    makeLogoUrl: item.model.make.logoUrl,
    makeName: item.model.make.name,
    makeSlug: item.model.make.slug,
    modelName: item.model.name,
    modelSlug: item.model.slug,
    years: item.model.years,
    priceTrackerAlertsEnabled: item.priceTrackerAlertsEnabled,
    listingTrackerAlertsEnabled: item.listingTrackerAlertsEnabled,
  };
}

function getGarageServiceWatch(
  vehicles: GarageClaimedVehicleRow[],
  serviceRecordsByVehicle: Map<string, Array<{ mileage: number; description: string }>>,
): GarageServiceWatchItem[] {
  return vehicles
    .map((vehicle) => {
      const recommendation = getNextMaintenanceRecommendation({
        currentMileage: vehicle.mileage,
        rules: vehicle.model.maintenanceRules,
        serviceRecords: serviceRecordsByVehicle.get(vehicle.id) ?? [],
      });

      if (!recommendation) return null;

      return {
        id: vehicle.id,
        href: `/vehicle/${vehicle.vin}#vehicle-maintenance`,
        logoUrl: vehicle.model.make.logoUrl,
        vehicleLabel: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
        serviceName: recommendation.serviceName,
        dueText: formatServiceDueText(recommendation.remainingMiles, recommendation.dueText),
        status: recommendation.status,
      };
    })
    .filter((item): item is GarageServiceWatchItem => Boolean(item))
    .sort((a, b) => serviceStatusRank(a.status) - serviceStatusRank(b.status));
}

function getRecentGarageActivity(
  vehicles: GarageClaimedVehicleRow[],
  garageItems: GarageItemRow[],
  meetActivity: Awaited<ReturnType<typeof getGarageMeetActivity>>,
): GarageRecentActivityItem[] {
  const vehicleActivity = vehicles.map((vehicle) => ({
    id: `claimed:${vehicle.id}`,
    href: `/vehicle/${vehicle.vin}`,
    tone: "add" as const,
    title: "Added a car",
    subtitle: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
    timestamp: formatRelativeDate(vehicle.createdAt),
    sortDate: vehicle.createdAt,
  }));
  const dreamActivity = garageItems.map((item) => ({
    id: `dream:${item.id}`,
    href: `/make/${item.model.make.slug}/${item.model.slug}`,
    tone: "market" as const,
    title: "Saved to dream garage",
    subtitle: `${item.model.make.name} ${item.model.name}`,
    timestamp: formatRelativeDate(item.createdAt),
    sortDate: item.createdAt,
  }));
  const meetItems = meetActivity.map((meet, index) => ({
    id: `meet:${meet.id}:${index}`,
    href: meet.href,
    tone: "meet" as const,
    title: meet.badge,
    subtitle: meet.title,
    timestamp: meet.date,
    sortDate: new Date(0),
  }));

  return [...vehicleActivity, ...dreamActivity, ...meetItems]
    .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      href: item.href,
      tone: item.tone,
      title: item.title,
      subtitle: item.subtitle,
      timestamp: item.timestamp,
    }));
}

function formatServiceDueText(remainingMiles: number | null, dueText: string) {
  if (remainingMiles === null) return dueText;
  if (remainingMiles <= 0) return "Due now";
  return `Due in ${remainingMiles.toLocaleString()} mi`;
}

function serviceStatusRank(status: GarageServiceWatchItem["status"]) {
  if (status === "DUE") return 0;
  if (status === "DUE_SOON") return 1;
  return 2;
}

function formatRelativeDate(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / 3_600_000));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}
