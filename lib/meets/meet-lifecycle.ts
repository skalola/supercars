import { prisma } from "@/lib/prisma";
import { notifyMeetReminder } from "@/lib/meets/meet-notifications";

type ProcessMeetLifecycleOptions = {
  now?: Date;
  reminderWindowHours?: number;
};

export async function processMeetLifecycle(options: ProcessMeetLifecycleOptions = {}) {
  const now = options.now ?? new Date();
  const reminderWindowHours = options.reminderWindowHours ?? 48;
  const reminderWindowEnd = new Date(now.getTime() + reminderWindowHours * 60 * 60 * 1000);

  const reminderCandidates = await prisma.meetRsvp.findMany({
    where: {
      status: { in: ["GOING", "MAYBE", "WAITLISTED"] },
      meet: {
        status: { in: ["PUBLISHED", "FULL"] },
        startsAt: {
          gt: now,
          lte: reminderWindowEnd,
        },
      },
      user: {
        email: { not: null },
      },
    },
    select: {
      meetId: true,
      userId: true,
    },
    take: 500,
  });

  const existingReminderKeys =
    reminderCandidates.length === 0
      ? new Set<string>()
      : new Set(
          (
            await prisma.meetNotification.findMany({
              where: {
                notificationType: "MEET_REMINDER_ATTENDEE",
                OR: reminderCandidates.map((candidate) => ({
                  meetId: candidate.meetId,
                  userId: candidate.userId,
                })),
              },
              select: {
                meetId: true,
                userId: true,
              },
            })
          ).map((notification) => `${notification.meetId}:${notification.userId}`)
        );

  let reminderCount = 0;
  for (const candidate of reminderCandidates) {
    if (existingReminderKeys.has(`${candidate.meetId}:${candidate.userId}`)) continue;
    await notifyMeetReminder(candidate.meetId, candidate.userId);
    reminderCount += 1;
  }

  const completed = await prisma.meet.updateMany({
    where: {
      status: { in: ["PUBLISHED", "FULL"] },
      startsAt: { lt: now },
    },
    data: {
      status: "COMPLETED",
      completedAt: now,
    },
  });

  return {
    reminderCount,
    completedCount: completed.count,
    reminderWindowEnd,
  };
}
