import { prisma } from "@/lib/prisma";

export const DEFAULT_CAR_CLUB_SLUG = "supercar-dash";
export const DEFAULT_CAR_CLUB_LOGO = "/images/supercar-dash-wordmark.svg";

export async function ensureDefaultClubMembership(userId: string) {
  const club = await ensureDefaultClub(userId);
  const membership = await prisma.carClubMember.findUnique({
    where: {
      clubId_userId: {
        clubId: club.id,
        userId,
      },
    },
    select: { id: true, status: true },
  });

  if (!membership) {
    await prisma.carClubMember.create({
      data: {
        clubId: club.id,
        userId,
        role: club.creatorId === userId ? "OWNER" : "MEMBER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  } else if (membership.status !== "ACTIVE") {
    await prisma.carClubMember.update({
      where: { id: membership.id },
      data: {
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  }

  return club;
}

export async function ensureDefaultClub(fallbackCreatorId: string) {
  const existingClub = await prisma.carClub.findUnique({
    where: { slug: DEFAULT_CAR_CLUB_SLUG },
    select: { id: true, creatorId: true },
  });
  if (existingClub) return existingClub;

  const creator = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const creatorId = creator?.id || fallbackCreatorId;

  return prisma.carClub.upsert({
    where: { slug: DEFAULT_CAR_CLUB_SLUG },
    update: {},
    create: {
      name: "Supercar Dash",
      slug: DEFAULT_CAR_CLUB_SLUG,
      logoUrl: DEFAULT_CAR_CLUB_LOGO,
      description: "The default SUPERCAR DASH club for every driver, open to all makes and models.",
      city: "Nationwide",
      state: "US",
      country: "US",
      visibility: "PUBLIC",
      status: "ACTIVE",
      creatorId,
    },
    select: { id: true, creatorId: true },
  });
}
