"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createClubInviteToken, verifyClubInviteToken } from "@/lib/clubs/invite-token";
import { isUploadableImageFile, uploadPublicImage } from "@/lib/media/upload-storage";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";
import {
  clubInviteTokenSchema,
  clubMemberActionInputSchema,
  createClubInputSchema,
  garageItemIdSchema,
  updateClubModelsInputSchema,
  updateClubProfileInputSchema,
} from "@/lib/validation/community-inputs";

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

  const clubInput = createClubInputSchema.parse({
    name: readString(formData, "name"),
    nationwide: readString(formData, "nationwide") === "true",
    city: readString(formData, "city"),
    state: readString(formData, "state"),
    country: readString(formData, "country") || "US",
    description: readString(formData, "description"),
    visibility: readString(formData, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    modelIds: uniqueStrings(formData.getAll("modelIds").map(String)),
    makeIds: uniqueStrings(formData.getAll("makeIds").map(String)),
  });
  const { name, city, state, country, description, visibility, modelIds, makeIds } = clubInput;

  const validModelIds = await resolveModelIds(modelIds, makeIds);

  const slug = await createUniqueClubSlug(name, city, state);
  const logoUrl = await resolveClubLogoUrl(formData, `clubs/${slug}/logos`);
  const club = await prisma.carClub.create({
    data: {
      name,
      slug,
      logoUrl,
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
  updateTag("public-clubs");
  revalidatePath("/garage");
  redirect(`/clubs/${club.slug}`);
}

export async function requestJoinClubAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const clubId = garageItemIdSchema.parse(readString(formData, "clubId"));

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
  updateTag("public-clubs");
  revalidatePath(`/clubs/${club.slug}`);
  redirect(`/clubs/${club.slug}`);
}

export async function manageClubMemberAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actorId = session.user.id as string;
  const { memberId, action } = clubMemberActionInputSchema.parse({
    memberId: readString(formData, "memberId"),
    action: readString(formData, "action"),
  });

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
  } else if (action === "PROMOTE") {
    await prisma.carClubMember.update({
      where: { id: memberId },
      data: { role: "MODERATOR" },
    });
  } else if (action === "DEMOTE") {
    await prisma.carClubMember.update({
      where: { id: memberId },
      data: { role: MEMBER_ROLE },
    });
  } else {
    throw new Error("Unsupported club member action.");
  }

  revalidatePath("/clubs");
  updateTag("public-clubs");
  revalidatePath(`/clubs/${membership.club.slug}`);
  redirect(`/clubs/${membership.club.slug}#members`);
}

export async function updateClubProfileAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const { clubId, name, city, state, description, visibility } = updateClubProfileInputSchema.parse({
    clubId: readString(formData, "clubId"),
    name: readString(formData, "name"),
    city: readString(formData, "city"),
    state: readString(formData, "state"),
    description: readString(formData, "description"),
    visibility: readString(formData, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
  });
  const logoFile = formData.get("logoFile");

  const canModerate = await canModerateClub(clubId, userId);
  if (!canModerate) throw new Error("Only club moderators can update this club.");

  const club = await prisma.carClub.findUnique({
    where: { id: clubId },
    select: { id: true, slug: true, name: true, city: true, state: true, logoUrl: true },
  });
  if (!club) throw new Error("Club not found.");

  const nextSlug = name !== club.name || city !== club.city || state !== club.state
    ? await createUniqueClubSlug(name, city, state, club.id)
    : club.slug;

  const logoUrl = isUploadableImageFile(logoFile)
    ? (await uploadPublicImage({ file: logoFile, folder: `clubs/${club.id}/logos` })).url
    : club.logoUrl;

  await prisma.carClub.update({
    where: { id: club.id },
    data: {
      name,
      slug: nextSlug,
      logoUrl,
      city,
      state,
      description: description || null,
      visibility,
    },
  });

  revalidatePath("/clubs");
  updateTag("public-clubs");
  revalidatePath(`/clubs/${club.slug}`);
  revalidatePath(`/clubs/${nextSlug}`);
  redirect(`/clubs/${nextSlug}#members`);
}

export async function updateClubModelsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const { clubId, modelIds, makeIds } = updateClubModelsInputSchema.parse({
    clubId: readString(formData, "clubId"),
    modelIds: uniqueStrings(formData.getAll("modelIds").map(String)),
    makeIds: uniqueStrings(formData.getAll("makeIds").map(String)),
  });

  const canModerate = await canModerateClub(clubId, userId);
  if (!canModerate) throw new Error("Only club moderators can update linked models.");

  const club = await prisma.carClub.findUnique({
    where: { id: clubId },
    select: { id: true, slug: true },
  });
  if (!club) throw new Error("Club not found.");

  const validModelIds = await resolveModelIds(modelIds, makeIds);

  await prisma.$transaction([
    prisma.carClubModel.deleteMany({ where: { clubId } }),
    ...(validModelIds.length
      ? [
          prisma.carClubModel.createMany({
            data: validModelIds.map((modelId) => ({ clubId, modelId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  revalidatePath("/clubs");
  updateTag("public-clubs");
  revalidatePath(`/clubs/${club.slug}`);
  redirect(`/clubs/${club.slug}#members`);
}

export async function leaveClubAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const clubId = garageItemIdSchema.parse(readString(formData, "clubId"));

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
  updateTag("public-clubs");
  revalidatePath(`/clubs/${membership.club.slug}`);
  redirect(`/clubs/${membership.club.slug}`);
}

export async function createClubInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const clubId = garageItemIdSchema.parse(readString(formData, "clubId"));

  await enforceActionRateLimit({
    actorId: userId,
    action: "CAR_CLUB_INVITE_CREATE",
    limit: 60,
    windowMs: 10 * 60 * 1000,
    bucketKey: clubId,
  });

  const [club, membership, user] = await Promise.all([
    prisma.carClub.findFirst({
      where: {
        id: clubId,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.carClubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { status: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
  ]);

  if (!club) throw new Error("Club not found.");
  if (membership?.status !== ACTIVE_MEMBER_STATUS && user?.role !== "ADMIN") {
    throw new Error("Only active club members can invite drivers.");
  }

  const token = createClubInviteToken({ clubId: club.id, inviterId: userId });
  return { invitePath: `/clubs/invite/${token}` };
}

export async function acceptClubInviteAction(formData: FormData) {
  const session = await auth();
  const parsedToken = clubInviteTokenSchema.safeParse(readString(formData, "token"));
  if (!session?.user?.id) {
    const returnTo = parsedToken.success ? `/clubs/invite/${parsedToken.data}` : "/clubs";
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  if (!parsedToken.success) throw new Error("This club invite is invalid or expired.");
  const token = parsedToken.data;

  const invite = verifyClubInviteToken(token);
  if (!invite) {
    throw new Error("This club invite is invalid or expired.");
  }

  const userId = session.user.id as string;
  await enforceActionRateLimit({
    actorId: userId,
    action: "CAR_CLUB_INVITE_ACCEPT",
    limit: 20,
    windowMs: 10 * 60 * 1000,
    bucketKey: invite.clubId,
  });

  const club = await prisma.carClub.findFirst({
    where: { id: invite.clubId, status: "ACTIVE" },
    select: { id: true, slug: true },
  });
  if (!club) throw new Error("Club not found.");

  await prisma.carClubMember.upsert({
    where: { clubId_userId: { clubId: club.id, userId } },
    update: {
      status: ACTIVE_MEMBER_STATUS,
      joinedAt: new Date(),
    },
    create: {
      clubId: club.id,
      userId,
      role: MEMBER_ROLE,
      status: ACTIVE_MEMBER_STATUS,
      joinedAt: new Date(),
    },
  });

  revalidatePath("/clubs");
  updateTag("public-clubs");
  revalidatePath(`/clubs/${club.slug}`);
  revalidatePath("/garage");
  redirect(`/clubs/${club.slug}`);
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

async function resolveModelIds(modelIds: string[], makeIds: string[]) {
  const modelFilters = [
    ...(modelIds.length ? [{ id: { in: modelIds } }] : []),
    ...(makeIds.length ? [{ makeId: { in: makeIds } }] : []),
  ];
  const validModels = modelFilters.length
    ? await prisma.model.findMany({
        where: { OR: modelFilters },
        select: { id: true },
      })
    : [];
  return uniqueStrings(validModels.map((model) => model.id));
}

async function createUniqueClubSlug(name: string, city: string, state: string, currentClubId?: string) {
  const base = `${name}-${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  let slug = base || "club";
  let index = 2;
  while (true) {
    const existing = await prisma.carClub.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === currentClubId) break;
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

async function resolveClubLogoUrl(formData: FormData, folder: string) {
  const logoFile = formData.get("logoFile");
  if (!isUploadableImageFile(logoFile)) return null;
  const upload = await uploadPublicImage({ file: logoFile, folder });
  return upload.url;
}
