import { prisma } from "@/lib/prisma";
import { notifyMeetReminderBatch } from "@/lib/meets/meet-notifications";

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
      meet: {
        select: {
          id: true,
          slug: true,
          title: true,
          type: true,
          startsAt: true,
          city: true,
          state: true,
          locationName: true,
          visibility: true,
          host: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
              trackerPreference: { select: { eventsTrackerEnabled: true } },
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          trackerPreference: { select: { eventsTrackerEnabled: true } },
        },
      },
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

  const pendingReminders = reminderCandidates
    .filter((candidate) => !existingReminderKeys.has(`${candidate.meetId}:${candidate.userId}`))
    .map((candidate) => ({ meet: candidate.meet, user: candidate.user }));
  await notifyMeetReminderBatch(pendingReminders);
  const reminderCount = pendingReminders.length;

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
