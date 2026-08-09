"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyMeetCancelled, notifyMeetCreated, notifyMeetRsvp } from "@/lib/meets/meet-notifications";

const SUPPORTED_MEET_MAKES = ["Ferrari", "Lamborghini", "McLaren"];

export async function createMeetAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const title = readString(formData, "title");
  const type = readString(formData, "type") || "Cars & Coffee";
  const startsAtInput = readString(formData, "startsAt");
  const city = readString(formData, "city");
  const state = readString(formData, "state").toUpperCase();
  const locationName = readString(formData, "locationName");
  const locationDetail = readString(formData, "locationDetail") || "Address shared after RSVP";
  const description = readString(formData, "description");
  const visibility = readString(formData, "visibility") === "INVITE_ONLY" ? "INVITE_ONLY" : "PUBLIC";
  const capacity = parseOptionalInt(readString(formData, "capacity"));
  const allowedMakes = SUPPORTED_MEET_MAKES.filter((make) => formData.getAll("allowedMakes").includes(make));

  if (!title || !startsAtInput || !city || !state || !locationName) {
    throw new Error("Title, date/time, city, state, and location name are required.");
  }

  const startsAt = new Date(startsAtInput);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("Choose a valid event date and time.");
  }

  const slug = await createUniqueMeetSlug(title, city, startsAt);
  const meet = await prisma.meet.create({
    data: {
      hostId: session.user.id as string,
      slug,
      title,
      type,
      status: "PUBLISHED",
      visibility,
      startsAt,
      city,
      state,
      locationName,
      locationDetail,
      capacity,
      description: description || null,
      allowedMakes: JSON.stringify(allowedMakes.length > 0 ? allowedMakes : SUPPORTED_MEET_MAKES),
      mapX: estimateMapX(state),
      mapY: estimateMapY(state),
      publishedAt: new Date(),
    },
  });

  await notifyMeetCreated(meet.id);

  revalidatePath("/meets");
  revalidatePath(`/garage/${await getUsername(session.user.id as string)}`);
  redirect(`/meets/${meet.slug}`);
}

export async function rsvpMeetAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const meetId = readString(formData, "meetId");
  const vehicleId = readString(formData, "vehicleId") || null;
  const status = normalizeRsvpStatus(readString(formData, "status"));

  if (!meetId) {
    throw new Error("Missing meet id.");
  }

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { id: true, slug: true, capacity: true, status: true },
  });

  if (!meet || !["PUBLISHED", "FULL"].includes(meet.status)) {
    throw new Error("This meet is not accepting RSVPs.");
  }

  if (vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerId: session.user.id as string, status: "CLAIMED" },
      select: { id: true },
    });
    if (!vehicle) {
      throw new Error("Choose one of your claimed cars.");
    }
  }

  const goingCount = await prisma.meetRsvp.count({
    where: { meetId, status: "GOING" },
  });
  const finalStatus = meet.capacity && goingCount >= meet.capacity && status === "GOING" ? "WAITLISTED" : status;

  await prisma.meetRsvp.upsert({
    where: {
      meetId_userId: {
        meetId,
        userId: session.user.id as string,
      },
    },
    update: {
      vehicleId,
      status: finalStatus,
    },
    create: {
      meetId,
      userId: session.user.id as string,
      vehicleId,
      status: finalStatus,
    },
  });

  await notifyMeetRsvp(meetId, session.user.id as string, finalStatus);

  revalidatePath("/meets");
  revalidatePath(`/meets/${meet.slug}`);
  revalidatePath("/garage");
  const username = await getUsername(session.user.id as string);
  if (username) revalidatePath(`/garage/${username}`);
  redirect(`/meets/${meet.slug}`);
}

export async function cancelHostedMeetAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const meetId = readString(formData, "meetId");
  if (!meetId) {
    throw new Error("Missing meet id.");
  }

  const meet = await prisma.meet.findFirst({
    where: {
      id: meetId,
      hostId: session.user.id as string,
      status: { in: ["DRAFT", "PUBLISHED", "FULL"] },
    },
    select: { id: true, slug: true },
  });

  if (!meet) {
    throw new Error("Only the host can cancel this meet.");
  }

  await prisma.meet.update({
    where: { id: meet.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  await notifyMeetCancelled(meet.id, session.user.id as string);

  revalidatePath("/meets");
  revalidatePath(`/meets/${meet.slug}`);
  revalidatePath("/garage");
  const username = await getUsername(session.user.id as string);
  if (username) revalidatePath(`/garage/${username}`);
  redirect(`/meets/${meet.slug}`);
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseOptionalInt(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function normalizeRsvpStatus(value: string) {
  if (value === "MAYBE" || value === "CANCELLED") return value;
  return "GOING";
}

async function createUniqueMeetSlug(title: string, city: string, startsAt: Date) {
  const base = `${title}-${city}-${startsAt.getFullYear()}-${startsAt.getMonth() + 1}-${startsAt.getDate()}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  let slug = base;
  let index = 2;
  while (await prisma.meet.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

async function getUsername(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  return user?.username || null;
}

function estimateMapX(state: string) {
  const xByState: Record<string, number> = {
    CA: 16, WA: 12, AZ: 25, CO: 36, TX: 45, IL: 58, MI: 64, NC: 69, GA: 65, FL: 77, NY: 78,
  };
  return xByState[state] ?? 50;
}

function estimateMapY(state: string) {
  const yByState: Record<string, number> = {
    WA: 23, CA: 60, AZ: 65, CO: 48, TX: 73, IL: 43, MI: 38, NC: 58, GA: 64, FL: 78, NY: 36,
  };
  return yByState[state] ?? 50;
}
