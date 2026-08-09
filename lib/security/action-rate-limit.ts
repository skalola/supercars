import { prisma } from "@/lib/prisma";

type RateLimitInput = {
  actorId: string;
  action: string;
  limit: number;
  windowMs: number;
  bucketKey?: string | null;
};

export async function enforceActionRateLimit({
  actorId,
  action,
  limit,
  windowMs,
  bucketKey,
}: RateLimitInput) {
  if (!actorId || !action || limit <= 0 || windowMs <= 0) {
    throw new Error("Invalid rate limit configuration.");
  }

  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs * 2);
  const actorKey = `user:${actorId}`;
  const normalizedBucket = normalizeBucketKey(bucketKey);

  const row = await prisma.actionRateLimit.upsert({
    where: {
      actorKey_action_bucketKey_windowStart: {
        actorKey,
        action,
        bucketKey: normalizedBucket,
        windowStart,
      },
    },
    update: {
      count: { increment: 1 },
      expiresAt,
    },
    create: {
      actorKey,
      action,
      bucketKey: normalizedBucket,
      windowStart,
      expiresAt,
      count: 1,
    },
    select: { count: true },
  });

  if (row.count > limit) {
    throw new Error("Too many requests. Please wait a few minutes and try again.");
  }
}

export async function pruneExpiredActionRateLimits() {
  await prisma.actionRateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

function normalizeBucketKey(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 160) : "GLOBAL";
}
