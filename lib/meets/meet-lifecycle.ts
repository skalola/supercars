import { prisma } from "@/lib/prisma";
import { notifyMeetReminderBatch } from "@/lib/meets/meet-notifications";

type ProcessMeetLifecycleOptions = {
  now?: Date;
  reminderWindowHours?: number;
  batchSize?: number;
};

const DEFAULT_MEET_REMINDER_BATCH_SIZE = 100;
const MAX_MEET_REMINDER_BATCH_SIZE = 250;

export async function processMeetLifecycle(options: ProcessMeetLifecycleOptions = {}) {
  const now = options.now ?? new Date();
  const reminderWindowHours = options.reminderWindowHours ?? 48;
  const reminderWindowEnd = new Date(now.getTime() + reminderWindowHours * 60 * 60 * 1000);
  const batchSize = Math.min(
    MAX_MEET_REMINDER_BATCH_SIZE,
    Math.max(1, Math.floor(options.batchSize ?? DEFAULT_MEET_REMINDER_BATCH_SIZE)),
  );
  let cursor: string | undefined;
  let reminderCount = 0;
  let batches = 0;

  while (true) {
    const reminderCandidates = await getMeetReminderBatch({
      now,
      reminderWindowEnd,
      batchSize,
      cursor,
    });
    if (reminderCandidates.length === 0) break;

    batches++;
    const existingReminderKeys = await getExistingReminderKeys(reminderCandidates);
    const pendingReminders = reminderCandidates
      .filter((candidate) => !existingReminderKeys.has(`${candidate.meetId}:${candidate.userId}`))
      .map((candidate) => ({ meet: candidate.meet, user: candidate.user }));

    await notifyMeetReminderBatch(pendingReminders);
    reminderCount += pendingReminders.length;

    if (reminderCandidates.length < batchSize) break;
    cursor = reminderCandidates[reminderCandidates.length - 1]?.id;
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
    batches,
    batchSize,
  };
}

function getMeetReminderBatch({
  now,
  reminderWindowEnd,
  batchSize,
  cursor,
}: {
  now: Date;
  reminderWindowEnd: Date;
  batchSize: number;
  cursor?: string;
}) {
  return prisma.meetRsvp.findMany({
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
      id: true,
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
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: batchSize,
  });
}

async function getExistingReminderKeys(
  reminderCandidates: Awaited<ReturnType<typeof getMeetReminderBatch>>,
) {
  if (reminderCandidates.length === 0) return new Set<string>();
  const notifications = await prisma.meetNotification.findMany({
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
  });
  return new Set(notifications.map((notification) => `${notification.meetId}:${notification.userId}`));
}
