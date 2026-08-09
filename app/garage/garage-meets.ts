import { prisma } from "@/lib/prisma";

export type GarageMeetSummary = {
  hosted: Array<{ title: string; href: string; meta: string; status: string }>;
  attended: Array<{ title: string; href: string; meta: string; status: string }>;
};

export async function getGarageMeetSummary(userId: string): Promise<GarageMeetSummary> {
  try {
    const [hostedRows, rsvpRows] = await Promise.all([
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
    ]);

    return {
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
    };
  } catch {
    return { hosted: [], attended: [] };
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
