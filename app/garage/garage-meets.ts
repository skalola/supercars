import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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
      statsRows,
    ] = await Promise.all([
      prisma.meet.findMany({
        where: { hostId: userId, status: { not: "HIDDEN" } },
        select: meetActivitySelect,
        orderBy: { startsAt: "desc" },
        take: 8,
      }),
      prisma.meetRsvp.findMany({
        where: { userId, status: { not: "CANCELLED" }, meet: { status: { not: "HIDDEN" } } },
        select: { status: true, meet: { select: meetActivitySelect } },
        orderBy: { meet: { startsAt: "desc" } },
        take: 8,
      }),
      prisma.meet.findMany({
        where: { hostId: userId, status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } },
        select: meetActivitySelect,
        orderBy: { startsAt: "asc" },
        take: 6,
      }),
      prisma.meetRsvp.findMany({
        where: { userId, status: { not: "CANCELLED" }, meet: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } },
        select: { status: true, meet: { select: meetActivitySelect } },
        orderBy: { meet: { startsAt: "asc" } },
        take: 8,
      }),
      prisma.$queryRaw<Array<{
        hosted: bigint;
        attended: bigint;
        upcomingHosted: bigint;
        upcomingAttended: bigint;
      }>>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM "Meet" meet
            WHERE meet."hostId" = ${userId} AND meet."status" <> 'HIDDEN')::bigint AS hosted,
          (SELECT COUNT(*) FROM "MeetRsvp" rsvp
            JOIN "Meet" meet ON meet."id" = rsvp."meetId"
            WHERE rsvp."userId" = ${userId} AND rsvp."status" <> 'CANCELLED'
              AND meet."status" <> 'HIDDEN')::bigint AS attended,
          (SELECT COUNT(*) FROM "Meet" meet
            WHERE meet."hostId" = ${userId} AND meet."status" IN ('PUBLISHED', 'FULL')
              AND meet."startsAt" >= ${now})::bigint AS "upcomingHosted",
          (SELECT COUNT(*) FROM "MeetRsvp" rsvp
            JOIN "Meet" meet ON meet."id" = rsvp."meetId"
            WHERE rsvp."userId" = ${userId} AND rsvp."status" <> 'CANCELLED'
              AND meet."status" IN ('PUBLISHED', 'FULL') AND meet."startsAt" >= ${now})::bigint AS "upcomingAttended"
      `),
    ]);
    const stats = statsRows[0];

    const attendedMeets = attendedRsvps
      .map((rsvp) => ({ meet: rsvp.meet, rsvpStatus: rsvp.status }))
      .sort((a, b) => b.meet.startsAt.getTime() - a.meet.startsAt.getTime())
      .slice(0, 8);

    const upcomingMeetItems = uniqueMeetItems([
      ...upcomingHostedMeets.map((meet) => toMeetActivityItem(meet, "Hosting")),
      ...upcomingRsvps
        .map((rsvp) => ({ meet: rsvp.meet, rsvpStatus: rsvp.status }))
        .sort((a, b) => a.meet.startsAt.getTime() - b.meet.startsAt.getTime())
        .map(({ meet, rsvpStatus }) => toMeetActivityItem(meet, formatRsvpBadge(rsvpStatus))),
    ]).slice(0, 8);

    return {
      stats: {
        hosted: Number(stats?.hosted ?? 0),
        attended: Number(stats?.attended ?? 0),
        upcoming: Number(stats?.upcomingHosted ?? 0) + Number(stats?.upcomingAttended ?? 0),
      },
      hosted: hostedMeets.map((meet) => toMeetActivityItem(meet, meet.status)),
      attended: attendedMeets.map(({ meet, rsvpStatus }) => toMeetActivityItem(meet, formatRsvpBadge(rsvpStatus))),
      upcoming: upcomingMeetItems,
    };
  } catch {
    return emptyMeetSummary();
  }
}

const meetActivitySelect = {
  id: true,
  slug: true,
  title: true,
  startsAt: true,
  city: true,
  state: true,
  status: true,
};

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
