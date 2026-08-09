import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MeetEvent = {
  id: string | null;
  slug: string;
  title: string;
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
  locationName: string;
  locationDetail: string;
  description: string;
  allowedMakes: string[];
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

export const demoMeetEvents: MeetEvent[] = [
  createDemoMeet({
    slug: "charlotte-supercar-breakfast",
    title: "Charlotte Supercar Breakfast",
    dateLabel: "Aug 24",
    timeLabel: "8:30 AM",
    city: "Charlotte",
    state: "NC",
    type: "Cars & Coffee",
    status: "Open",
    expectedCars: 18,
    host: "SUPERCAR DASH Hosted",
    locationName: "South End Garage Row",
    locationDetail: "Exact bay shared after RSVP",
    description: "A low-key owner breakfast and morning roll-out built around verified garage profiles.",
    mapX: 69,
    mapY: 58,
    accent: "red",
  }),
  createDemoMeet({
    slug: "miami-coastal-cruise",
    title: "Miami Coastal Cruise",
    dateLabel: "Aug 31",
    timeLabel: "7:00 AM",
    city: "Miami",
    state: "FL",
    type: "Private Drive",
    status: "Open",
    expectedCars: 24,
    host: "Miami Owners Circle",
    locationName: "Brickell Meet Point",
    locationDetail: "Route opens after RSVP",
    description: "Early coastal drive with photo stop, breakfast, and verified car roll call.",
    mapX: 77,
    mapY: 78,
    accent: "red",
  }),
  createDemoMeet({
    slug: "la-canyon-run",
    title: "Canyon Run",
    dateLabel: "Sep 7",
    timeLabel: "6:45 AM",
    city: "Los Angeles",
    state: "CA",
    type: "Drive",
    status: "Invite Only",
    expectedCars: 20,
    host: "West Coast Garage",
    locationName: "Malibu Staging Point",
    locationDetail: "Private route shared with approved cars",
    description: "Morning canyon session with a verified-car attendance list and post-drive gallery.",
    mapX: 16,
    mapY: 60,
    accent: "red",
  }),
  createDemoMeet({
    slug: "atlanta-midtown-meet",
    title: "Midtown Meet",
    dateLabel: "Sep 14",
    timeLabel: "9:00 AM",
    city: "Atlanta",
    state: "GA",
    type: "Garage Night",
    status: "Open",
    expectedCars: 15,
    host: "Atlanta Supercar Society",
    locationName: "Midtown Private Deck",
    locationDetail: "Address shared after RSVP",
    description: "A city meet for owners who want a clean roll call, parking order, and car-led profiles.",
    mapX: 65,
    mapY: 64,
    accent: "white",
  }),
  createDemoMeet({
    slug: "chicago-lakeside-drive",
    title: "Lakeside Drive",
    dateLabel: "Sep 21",
    timeLabel: "8:00 AM",
    city: "Chicago",
    state: "IL",
    type: "Drive",
    status: "Open",
    expectedCars: 22,
    host: "Great Lakes Owners",
    locationName: "North Shore Start",
    locationDetail: "Parking zone shared after RSVP",
    description: "Lakefront morning route with verified cars and owner activity logged back to the garage.",
    mapX: 58,
    mapY: 43,
    accent: "red",
  }),
  createDemoMeet({
    slug: "seattle-mountain-loop",
    title: "Mountain Loop",
    dateLabel: "Sep 28",
    timeLabel: "7:30 AM",
    city: "Seattle",
    state: "WA",
    type: "Private Drive",
    status: "Full",
    expectedCars: 12,
    host: "Pacific Northwest Garage",
    locationName: "Eastside Start",
    locationDetail: "Waitlist open",
    description: "Small-capacity mountain drive with curated attendance and post-event car photography.",
    mapX: 12,
    mapY: 23,
    accent: "white",
  }),
];

export async function getUpcomingMeetEvents() {
  try {
    const rows = await prisma.meet.findMany({
      where: {
        status: { in: ["PUBLISHED", "FULL", "COMPLETED"] },
      },
      include: meetInclude,
      orderBy: { startsAt: "asc" },
      take: 24,
    });
    if (rows.length === 0) return demoMeetEvents;
    return rows.map(serializeMeet);
  } catch {
    return demoMeetEvents;
  }
}

export async function getMeetBySlug(slug: string) {
  try {
    const row = await prisma.meet.findUnique({
      where: { slug },
      include: meetInclude,
    });
    if (row) return serializeMeet(row);
  } catch {
    return demoMeetEvents.find((meet) => meet.slug === slug) ?? null;
  }
  return demoMeetEvents.find((meet) => meet.slug === slug) ?? null;
}

const meetInclude = {
  host: { select: { username: true, name: true } },
  rsvps: {
    where: { status: { in: ["GOING", "MAYBE", "WAITLISTED"] } },
    include: {
      user: { select: { username: true, name: true } },
      vehicle: {
        include: {
          photos: { orderBy: [{ isHero: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }], take: 1 },
          images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 },
          model: { include: { make: true, images: { take: 1 } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 12,
  },
  photos: {
    include: {
      user: { select: { username: true, name: true } },
      vehicle: {
        include: {
          model: { include: { make: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  },
} satisfies Prisma.MeetInclude;

type MeetRow = Prisma.MeetGetPayload<{ include: typeof meetInclude }>;

function serializeMeet(row: MeetRow): MeetEvent {
  const allowedMakes = parseAllowedMakes(row.allowedMakes);
  const goingCount = row.rsvps.filter((rsvp) => rsvp.status === "GOING" || rsvp.status === "MAYBE").length;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    dateLabel: formatDate(row.startsAt),
    timeLabel: formatTime(row.startsAt),
    city: row.city,
    state: row.state,
    type: row.type,
    status: getPublicStatus(row.status, row.visibility),
    expectedCars: goingCount || row.capacity || 0,
    capacity: row.capacity,
    host: row.host.name || row.host.username || "SUPERCAR DASH Member",
    hostUserId: row.hostId,
    hostUsername: row.host.username,
    locationName: row.locationName,
    locationDetail: row.locationDetail || (row.visibility === "INVITE_ONLY" ? "Shared with approved RSVPs" : "Address shared after RSVP"),
    description: row.description || "A SUPERCAR DASH owner meet built around verified garage profiles.",
    allowedMakes,
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

function createDemoMeet(input: Omit<MeetEvent, "id" | "capacity" | "hostUserId" | "hostUsername" | "allowedMakes" | "heroImage" | "isDemo" | "cars" | "photos">): MeetEvent {
  return {
    ...input,
    id: null,
    capacity: input.expectedCars,
    hostUserId: null,
    hostUsername: null,
    allowedMakes: ["Ferrari", "Lamborghini", "McLaren"],
    heroImage: "/images/garage-home-hero.png?v=garage-2",
    isDemo: true,
    cars: [
      { name: "Ferrari 458 Italia", owner: "@redline", ownerHref: "/garage", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "Lamborghini Huracan", owner: "@v10club", ownerHref: "/garage", image: "/images/garage-home-hero.png?v=garage-2" },
      { name: "McLaren 720S", owner: "@carbonclub", ownerHref: "/garage", image: "/images/garage-home-hero.png?v=garage-2" },
    ],
    photos: [],
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
