import { prisma } from "@/lib/prisma";

export type GarageMeetSummary = {
  stats: {
    hosted: number;
    attended: number;
    upcoming: number;
    completed: number;
    photos: number;
  };
  hosted: Array<{ title: string; href: string; meta: string; status: string }>;
  attended: Array<{ title: string; href: string; meta: string; status: string }>;
  photos: Array<{ url: string; caption: string | null; href: string; meetTitle: string }>;
};

export async function getGarageMeetSummary(userId: string): Promise<GarageMeetSummary> {
  try {
    const now = new Date();
    const [hostedRows, rsvpRows, hostedCount, attendedCount, upcomingHosted, upcomingAttended, completedHosted, completedAttended, photoCount, photoRows] = await Promise.all([
      prisma.meet.findMany({
        where: { hostId: userId, status: { not: "HIDDEN" } },
        select: { slug: true, title: true, startsAt: true, city: true, state: true, status: true },
        orderBy: { startsAt: "desc" },
        take: 4,
      }),
      prisma.meetRsvp.findMany({
        where: { userId, status: { not: "CANCELLED" } },
        select: {
          status: true,
          meet: { select: { slug: true, title: true, startsAt: true, city: true, state: true, status: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
      prisma.meet.count({ where: { hostId: userId, status: { not: "HIDDEN" } } }),
      prisma.meetRsvp.count({ where: { userId, status: { not: "CANCELLED" }, meet: { status: { not: "HIDDEN" } } } }),
      prisma.meet.count({ where: { hostId: userId, status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } }),
      prisma.meetRsvp.count({ where: { userId, status: { not: "CANCELLED" }, meet: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } } }),
      prisma.meet.count({ where: { hostId: userId, status: "COMPLETED" } }),
      prisma.meetRsvp.count({ where: { userId, status: { not: "CANCELLED" }, meet: { status: "COMPLETED" } } }),
      prisma.meetPhoto.count({ where: { userId, meet: { status: { not: "HIDDEN" } } } }),
      prisma.meetPhoto.findMany({
        where: { userId, meet: { status: { not: "HIDDEN" } } },
        select: {
          url: true,
          caption: true,
          meet: { select: { slug: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    return {
      stats: {
        hosted: hostedCount,
        attended: attendedCount,
        upcoming: upcomingHosted + upcomingAttended,
        completed: completedHosted + completedAttended,
        photos: photoCount,
      },
      hosted: hostedRows.map((meet) => ({
        title: meet.title,
        href: `/meets/${meet.slug}`,
        meta: `${formatDate(meet.startsAt)} · ${meet.city}, ${meet.state}`,
        status: formatStatus(meet.status),
      })),
      attended: rsvpRows.map((rsvp) => ({
        title: rsvp.meet.title,
        href: `/meets/${rsvp.meet.slug}`,
        meta: `${formatDate(rsvp.meet.startsAt)} · ${rsvp.meet.city}, ${rsvp.meet.state}`,
        status: formatStatus(rsvp.status),
      })),
      photos: photoRows.map((photo) => ({
        url: photo.url,
        caption: photo.caption,
        href: `/meets/${photo.meet.slug}`,
        meetTitle: photo.meet.title,
      })),
    };
  } catch {
    return {
      stats: { hosted: 0, attended: 0, upcoming: 0, completed: 0, photos: 0 },
      hosted: [],
      attended: [],
      photos: [],
    };
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
