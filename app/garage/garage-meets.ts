import { prisma } from "@/lib/prisma";

export type GarageMeetSummary = {
  stats: {
    hosted: number;
    attended: number;
    upcoming: number;
    photos: number;
  };
};

export async function getGarageMeetSummary(userId: string): Promise<GarageMeetSummary> {
  try {
    const now = new Date();
    const [hostedCount, attendedCount, upcomingHosted, upcomingAttended, photoCount] = await Promise.all([
      prisma.meet.count({ where: { hostId: userId, status: { not: "HIDDEN" } } }),
      prisma.meetRsvp.count({ where: { userId, status: { not: "CANCELLED" }, meet: { status: { not: "HIDDEN" } } } }),
      prisma.meet.count({ where: { hostId: userId, status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } }),
      prisma.meetRsvp.count({ where: { userId, status: { not: "CANCELLED" }, meet: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } } }),
      prisma.meetPhoto.count({ where: { userId, meet: { status: { not: "HIDDEN" } } } }),
    ]);

    return {
      stats: {
        hosted: hostedCount,
        attended: attendedCount,
        upcoming: upcomingHosted + upcomingAttended,
        photos: photoCount,
      },
    };
  } catch {
    return {
      stats: { hosted: 0, attended: 0, upcoming: 0, photos: 0 },
    };
  }
}
