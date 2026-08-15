import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { normalizeMeetType } from "@/lib/meets/meet-types";
import { prisma } from "@/lib/prisma";

export type MeetEvent = {
  id: string | null;
  slug: string;
  title: string;
  startsAt: string;
  dateLabel: string;
  timeLabel: string;
  city: string;
  state: string;
  type: string;
  status: "Open" | "Invite Only" | "Full" | "Completed" | "Cancelled";
  expectedCars: number;
  capacity: number | null;
  host: string;
  hostUserId: string | null;
  hostUsername: string | null;
  club: { name: string; slug: string } | null;
  locationName: string;
  locationDetail: string;
  description: string;
  allowedMakes: string[];
  latitude: number | null;
  longitude: number | null;
  mapX: number;
  mapY: number;
  accent: "red" | "white";
  heroImage: string;
  isDemo: boolean;
  cars: Array<{
    name: string;
    owner: string;
    ownerHref: string;
    image: string;
  }>;
  photos: Array<{
    id: string;
    url: string;
    caption: string | null;
    owner: string;
    vehicleLabel: string | null;
    vehicleHref: string | null;
    createdAt: string;
  }>;
};

const cityCoordinates: Record<string, { latitude: number; longitude: number }> = {
  "charlotte, nc": { latitude: 35.2271, longitude: -80.8431 },
  "miami, fl": { latitude: 25.7617, longitude: -80.1918 },
  "los angeles, ca": { latitude: 34.0522, longitude: -118.2437 },
  "atlanta, ga": { latitude: 33.749, longitude: -84.388 },
  "chicago, il": { latitude: 41.8781, longitude: -87.6298 },
  "seattle, wa": { latitude: 47.6062, longitude: -122.3321 },
};

const stateCoordinates: Record<string, { latitude: number; longitude: number }> = {
  AZ: { latitude: 34.0489, longitude: -111.0937 },
  CA: { latitude: 36.7783, longitude: -119.4179 },
  CO: { latitude: 39.5501, longitude: -105.7821 },
  FL: { latitude: 27.6648, longitude: -81.5158 },
  GA: { latitude: 32.1656, longitude: -82.9001 },
  IL: { latitude: 40.6331, longitude: -89.3985 },
  MI: { latitude: 44.3148, longitude: -85.6024 },
  NC: { latitude: 35.7596, longitude: -79.0193 },
  NY: { latitude: 43.2994, longitude: -74.2179 },
  TX: { latitude: 31.9686, longitude: -99.9018 },
  WA: { latitude: 47.7511, longitude: -120.7401 },
};

export const getUpcomingMeetEvents = unstable_cache(async () => {
  try {
    const rows = await prisma.meet.findMany({
      where: {
        status: { in: ["PUBLISHED", "FULL", "COMPLETED"] },
      },
      select: meetSelect,
      orderBy: { startsAt: "asc" },
      take: 24,
    });
    return rows.map(serializeMeet);
  } catch {
    return [];
  }
}, ["public-upcoming-meets-v1"], { revalidate: 300, tags: ["public-meets"] });

export const getMeetBySlug = unstable_cache(async (slug: string) => {
  try {
    const row = await prisma.meet.findUnique({
      where: { slug },
      select: meetSelect,
    });
    if (row) return serializeMeet(row);
  } catch {
    return null;
  }
  return null;
}, ["public-meet-detail-v1"], { revalidate: 300, tags: ["public-meets"] });

const meetSelect = {
  id: true,
  slug: true,
  title: true,
  startsAt: true,
  city: true,
  state: true,
  type: true,
  status: true,
  visibility: true,
  capacity: true,
  hostId: true,
  locationName: true,
  locationDetail: true,
  description: true,
  allowedMakes: true,
  latitude: true,
  longitude: true,
  mapX: true,
  mapY: true,
  heroImageUrl: true,
  host: { select: { username: true, name: true } },
  club: { select: { name: true, slug: true } },
  rsvps: {
    where: { status: { in: ["GOING", "MAYBE", "WAITLISTED"] } },
    select: {
      status: true,
      user: { select: { username: true, name: true } },
      vehicle: {
        select: {
          vin: true,
          year: true,
          photos: {
            select: { filePath: true },
            orderBy: [{ isHero: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
            take: 1,
          },
          images: {
            select: { url: true },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
          },
          model: {
            select: {
              name: true,
              make: { select: { name: true } },
              images: {
                select: { url: true },
                orderBy: [{ type: "asc" }, { createdAt: "asc" }],
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 12,
  },
  photos: {
    select: {
      id: true,
      url: true,
      caption: true,
      createdAt: true,
      user: { select: { username: true, name: true } },
      vehicle: {
        select: {
          vin: true,
          year: true,
          model: {
            select: {
              name: true,
              make: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  },
} satisfies Prisma.MeetSelect;

type MeetRow = Prisma.MeetGetPayload<{ select: typeof meetSelect }>;

function serializeMeet(row: MeetRow): MeetEvent {
  const allowedMakes = parseAllowedMakes(row.allowedMakes);
  const goingCount = row.rsvps.filter((rsvp) => rsvp.status === "GOING" || rsvp.status === "MAYBE").length;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    dateLabel: formatDate(row.startsAt),
    timeLabel: formatTime(row.startsAt),
    city: row.city,
    state: row.state,
    type: normalizeMeetType(row.type),
    status: getPublicStatus(row.status, row.visibility),
    expectedCars: goingCount || row.capacity || 0,
    capacity: row.capacity,
    host: row.host.name || row.host.username || "SUPERCAR DASH Member",
    hostUserId: row.hostId,
    hostUsername: row.host.username,
    club: row.club ? { name: row.club.name, slug: row.club.slug } : null,
    locationName: row.locationName,
    locationDetail: row.locationDetail || (row.visibility === "INVITE_ONLY" ? "Shared with approved RSVPs" : "Address shared after RSVP"),
    description: row.description || "A SUPERCAR DASH owner meet built around verified garage profiles.",
    allowedMakes,
    latitude: row.latitude ?? estimateLatitude(row.city, row.state),
    longitude: row.longitude ?? estimateLongitude(row.city, row.state),
    mapX: row.mapX ?? estimateMapX(row.state),
    mapY: row.mapY ?? estimateMapY(row.state),
    accent: row.status === "FULL" || row.visibility === "INVITE_ONLY" ? "white" : "red",
    heroImage: row.heroImageUrl || "/images/garage-home-hero.png?v=garage-2",
    isDemo: false,
    cars: row.rsvps
      .filter((rsvp) => rsvp.vehicle)
      .map((rsvp) => {
        const vehicle = rsvp.vehicle!;
        return {
          name: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
          owner: `@${rsvp.user.username || rsvp.user.name || "member"}`,
          ownerHref: rsvp.user.username ? `/garage/${rsvp.user.username}` : "/garage",
          image: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || "/images/garage-home-hero.png?v=garage-2",
        };
      }),
    photos: row.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption,
      owner: `@${photo.user?.username || photo.user?.name || "member"}`,
      vehicleLabel: photo.vehicle
        ? `${photo.vehicle.year} ${photo.vehicle.model.make.name} ${photo.vehicle.model.name}`
        : null,
      vehicleHref: photo.vehicle ? `/vehicle/${photo.vehicle.vin}` : null,
      createdAt: photo.createdAt.toISOString(),
    })),
  };
}

function parseAllowedMakes(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    return ["Ferrari", "Lamborghini", "McLaren"];
  }
  return ["Ferrari", "Lamborghini", "McLaren"];
}

function getPublicStatus(status: string, visibility: string): MeetEvent["status"] {
  if (status === "FULL") return "Full";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (visibility === "INVITE_ONLY") return "Invite Only";
  return "Open";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function estimateMapX(state: string) {
  const xByState: Record<string, number> = {
    CA: 16, WA: 12, AZ: 25, CO: 36, TX: 45, IL: 58, MI: 64, NC: 69, GA: 65, FL: 77, NY: 78,
  };
  return xByState[state.toUpperCase()] ?? 50;
}

function estimateMapY(state: string) {
  const yByState: Record<string, number> = {
    WA: 23, CA: 60, AZ: 65, CO: 48, TX: 73, IL: 43, MI: 38, NC: 58, GA: 64, FL: 78, NY: 36,
  };
  return yByState[state.toUpperCase()] ?? 50;
}

function estimateLatitude(city: string, state: string) {
  const key = `${city}, ${state}`.toLowerCase();
  const coordinates = cityCoordinates[key] ?? stateCoordinates[state.toUpperCase()];
  return coordinates?.latitude ?? null;
}

function estimateLongitude(city: string, state: string) {
  const key = `${city}, ${state}`.toLowerCase();
  const coordinates = cityCoordinates[key] ?? stateCoordinates[state.toUpperCase()];
  return coordinates?.longitude ?? null;
}
