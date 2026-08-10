"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";

const ACTIVE_MEMBER_STATUS = "ACTIVE";
const PENDING_MEMBER_STATUS = "PENDING";
const MEMBER_ROLE = "MEMBER";
const OWNER_ROLE = "OWNER";

export async function createCarClubAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  await enforceActionRateLimit({
    actorId: userId,
    action: "CAR_CLUB_CREATE",
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  const name = readString(formData, "name");
  const city = readString(formData, "city");
  const state = readString(formData, "state").toUpperCase();
  const country = readString(formData, "country") || "US";
  const description = readString(formData, "description");
  const visibility = readString(formData, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC";
  const modelIds = uniqueStrings(formData.getAll("modelIds").map((value) => String(value)));

  if (!name || name.length < 3) {
    throw new Error("Club name must be at least 3 characters.");
  }
  if (!city || !state) {
    throw new Error("City and state are required.");
  }

  const validModels = modelIds.length
    ? await prisma.model.findMany({
        where: { id: { in: modelIds } },
        select: { id: true },
      })
    : [];
  const validModelIds = validModels.map((model) => model.id);

  const slug = await createUniqueClubSlug(name, city, state);
  const club = await prisma.carClub.create({
    data: {
      name,
      slug,
      description: description || null,
      city,
      state,
      country,
      visibility,
      creatorId: userId,
      members: {
        create: {
          userId,
          role: OWNER_ROLE,
          status: ACTIVE_MEMBER_STATUS,
          joinedAt: new Date(),
        },
      },
      models: {
        create: validModelIds.map((modelId) => ({ modelId })),
      },
    },
    select: { slug: true },
  });

  revalidatePath("/clubs");
  revalidatePath("/garage");
  redirect(`/clubs/${club.slug}`);
}

export async function requestJoinClubAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const clubId = readString(formData, "clubId");
  if (!clubId) throw new Error("Missing club.");

  await enforceActionRateLimit({
    actorId: userId,
    action: "CAR_CLUB_JOIN",
    limit: 30,
    windowMs: 10 * 60 * 1000,
    bucketKey: clubId,
  });

  const club = await prisma.carClub.findFirst({
    where: { id: clubId, status: "ACTIVE" },
    select: { id: true, slug: true, visibility: true, creatorId: true },
  });
  if (!club) throw new Error("Club not found.");

  const status = club.visibility === "PRIVATE" && club.creatorId !== userId ? PENDING_MEMBER_STATUS : ACTIVE_MEMBER_STATUS;
  await prisma.carClubMember.upsert({
    where: { clubId_userId: { clubId, userId } },
    update: {
      status,
      joinedAt: status === ACTIVE_MEMBER_STATUS ? new Date() : null,
    },
    create: {
      clubId,
      userId,
      role: MEMBER_ROLE,
      status,
      joinedAt: status === ACTIVE_MEMBER_STATUS ? new Date() : null,
    },
  });

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${club.slug}`);
  redirect(`/clubs/${club.slug}`);
}

export async function manageClubMemberAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actorId = session.user.id as string;
  const memberId = readString(formData, "memberId");
  const action = readString(formData, "action");
  if (!memberId || !action) throw new Error("Missing club member action.");

  await enforceActionRateLimit({
    actorId,
    action: "CAR_CLUB_MEMBER_MANAGE",
    limit: 80,
    windowMs: 10 * 60 * 1000,
    bucketKey: memberId,
  });

  const membership = await prisma.carClubMember.findUnique({
    where: { id: memberId },
    include: { club: { select: { id: true, slug: true, creatorId: true } } },
  });
  if (!membership) throw new Error("Membership not found.");

  const canModerate = await canModerateClub(membership.clubId, actorId);
  if (!canModerate) throw new Error("Only club moderators can manage members.");
  if (membership.club.creatorId === membership.userId && action === "REMOVE") {
    throw new Error("The club owner cannot be removed.");
  }

  if (action === "APPROVE") {
    await prisma.carClubMember.update({
      where: { id: memberId },
      data: { status: ACTIVE_MEMBER_STATUS, joinedAt: new Date() },
    });
  } else if (action === "DECLINE") {
    await prisma.carClubMember.update({
      where: { id: memberId },
      data: { status: "DECLINED", joinedAt: null },
    });
  } else if (action === "REMOVE") {
    await prisma.carClubMember.update({
      where: { id: memberId },
      data: { status: "REMOVED", joinedAt: null },
    });
  } else {
    throw new Error("Unsupported club member action.");
  }

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${membership.club.slug}`);
  redirect(`/clubs/${membership.club.slug}#members`);
}

export async function leaveClubAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const clubId = readString(formData, "clubId");
  if (!clubId) throw new Error("Missing club.");

  const membership = await prisma.carClubMember.findUnique({
    where: { clubId_userId: { clubId, userId } },
    include: { club: { select: { slug: true, creatorId: true } } },
  });
  if (!membership) throw new Error("Membership not found.");
  if (membership.club.creatorId === userId) {
    throw new Error("Club owners cannot leave their own club.");
  }

  await prisma.carClubMember.update({
    where: { id: membership.id },
    data: { status: "REMOVED", joinedAt: null },
  });

  revalidatePath("/clubs");
  revalidatePath(`/clubs/${membership.club.slug}`);
  redirect(`/clubs/${membership.club.slug}`);
}

async function canModerateClub(clubId: string, userId: string) {
  const [user, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.carClubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { role: true, status: true },
    }),
  ]);
  if (user?.role === "ADMIN") return true;
  return Boolean(member?.status === ACTIVE_MEMBER_STATUS && ["OWNER", "MODERATOR"].includes(member.role));
}

async function createUniqueClubSlug(name: string, city: string, state: string) {
  const base = `${name}-${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  let slug = base || "club";
  let index = 2;
  while (await prisma.carClub.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
