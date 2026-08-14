import { prisma } from "@/lib/prisma";

export type GarageClubSummaryItem = {
  id: string;
  href: string;
  name: string;
  logoUrl: string | null;
  role: string;
  status: string;
  location: string;
};

export async function getGarageClubSummary(userId: string, includePending = false): Promise<GarageClubSummaryItem[]> {
  const statuses = includePending ? ["ACTIVE", "PENDING"] : ["ACTIVE"];
  const memberships = await prisma.carClubMember.findMany({
    where: {
      userId,
      status: { in: statuses },
      club: { status: "ACTIVE" },
    },
    select: {
      role: true,
      status: true,
      club: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          city: true,
          state: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { joinedAt: "desc" }, { createdAt: "desc" }],
  });

  return memberships.map((membership) => ({
    id: membership.club.id,
    href: `/clubs/${membership.club.slug}`,
    name: membership.club.name,
    logoUrl: membership.club.logoUrl,
    role: membership.role,
    status: membership.status,
    location: [membership.club.city, membership.club.state].filter(Boolean).join(", ") || "Location pending",
  }));
}
