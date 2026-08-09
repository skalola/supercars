import { prisma } from "@/lib/prisma";

export type GarageMeetActivityItem = {
  id: string;
  title: string;
  href: string;
  date: string;
  location: string;
  status: string;
  badge: string;
};

export type GarageMeetSummary = {
  stats: {
    hosted: number;
    attended: number;
    upcoming: number;
  };
  hosted: GarageMeetActivityItem[];
  attended: GarageMeetActivityItem[];
  upcoming: GarageMeetActivityItem[];
};

export async function getGarageMeetSummary(userId: string): Promise<GarageMeetSummary> {
  try {
    const now = new Date();
    const [
      hostedMeets,
      attendedRsvps,
      upcomingHostedMeets,
      upcomingRsvps,
      hostedCount,
      attendedCount,
      upcomingHostedCount,
      upcomingAttendedCount,
    ] = await Promise.all([
      prisma.meet.findMany({
        where: { hostId: userId, status: { not: "HIDDEN" } },
        orderBy: { startsAt: "desc" },
        take: 40,
      }),
      prisma.meetRsvp.findMany({
        where: { userId, status: { not: "CANCELLED" }, meet: { status: { not: "HIDDEN" } } },
        include: { meet: true },
      }),
      prisma.meet.findMany({
        where: { hostId: userId, status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 24,
      }),
      prisma.meetRsvp.findMany({
        where: { userId, status: { not: "CANCELLED" }, meet: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } },
        include: { meet: true },
      }),
      prisma.meet.count({ where: { hostId: userId, status: { not: "HIDDEN" } } }),
      prisma.meetRsvp.count({ where: { userId, status: { not: "CANCELLED" }, meet: { status: { not: "HIDDEN" } } } }),
      prisma.meet.count({ where: { hostId: userId, status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } }),
      prisma.meetRsvp.count({ where: { userId, status: { not: "CANCELLED" }, meet: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } } }),
    ]);

    const attendedMeets = attendedRsvps
      .map((rsvp) => ({ meet: rsvp.meet, rsvpStatus: rsvp.status }))
      .sort((a, b) => b.meet.startsAt.getTime() - a.meet.startsAt.getTime())
      .slice(0, 40);

    const upcomingMeetItems = uniqueMeetItems([
      ...upcomingHostedMeets.map((meet) => toMeetActivityItem(meet, "Hosting")),
      ...upcomingRsvps
        .map((rsvp) => ({ meet: rsvp.meet, rsvpStatus: rsvp.status }))
        .sort((a, b) => a.meet.startsAt.getTime() - b.meet.startsAt.getTime())
        .map(({ meet, rsvpStatus }) => toMeetActivityItem(meet, formatRsvpBadge(rsvpStatus))),
    ]).slice(0, 40);

    return {
      stats: {
        hosted: hostedCount,
        attended: attendedCount,
        upcoming: upcomingHostedCount + upcomingAttendedCount,
      },
      hosted: hostedMeets.map((meet) => toMeetActivityItem(meet, meet.status)),
      attended: attendedMeets.map(({ meet, rsvpStatus }) => toMeetActivityItem(meet, formatRsvpBadge(rsvpStatus))),
      upcoming: upcomingMeetItems,
    };
  } catch {
    return emptyMeetSummary();
  }
}

function emptyMeetSummary(): GarageMeetSummary {
  return {
    stats: { hosted: 0, attended: 0, upcoming: 0 },
    hosted: [],
    attended: [],
    upcoming: [],
  };
}

function toMeetActivityItem(
  meet: {
    id: string;
    slug: string;
    title: string;
    startsAt: Date;
    city: string;
    state: string;
    status: string;
  },
  badge: string,
): GarageMeetActivityItem {
  return {
    id: meet.id,
    title: meet.title,
    href: `/meets/${meet.slug}`,
    date: formatMeetDate(meet.startsAt),
    location: [meet.city, meet.state].filter(Boolean).join(", "),
    status: meet.status,
    badge: formatBadge(badge),
  };
}

function uniqueMeetItems(items: GarageMeetActivityItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatMeetDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRsvpBadge(status: string) {
  if (status === "GOING") return "Registered";
  if (status === "MAYBE") return "Maybe";
  if (status === "WAITLISTED") return "Waitlisted";
  return status;
}

function formatBadge(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
