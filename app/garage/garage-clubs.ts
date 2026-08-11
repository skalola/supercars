import { prisma } from "@/lib/prisma";

export type GarageClubSummaryItem = {
  id: string;
  href: string;
  name: string;
  logoUrl: string | null;
  role: string;
  status: string;
  location: string;
  memberCount: number;
  modelCount: number;
  meetCount: number;
  modelLabels: string[];
};

export async function getGarageClubSummary(userId: string, includePending = false): Promise<GarageClubSummaryItem[]> {
  const statuses = includePending ? ["ACTIVE", "PENDING"] : ["ACTIVE"];
  const memberships = await prisma.carClubMember.findMany({
    where: {
      userId,
      status: { in: statuses },
      club: { status: "ACTIVE" },
    },
    include: {
      club: {
        include: {
          members: { where: { status: "ACTIVE" }, select: { id: true } },
          models: {
            include: { model: { include: { make: true } } },
            orderBy: { createdAt: "asc" },
          },
          meets: {
            where: { status: { in: ["PUBLISHED", "FULL", "COMPLETED"] } },
            select: { id: true },
          },
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
    memberCount: membership.club.members.length,
    modelCount: membership.club.models.length,
    meetCount: membership.club.meets.length,
    modelLabels: membership.club.models.slice(0, 4).map(({ model }) => `${model.make.name} ${model.name}`),
  }));
}
