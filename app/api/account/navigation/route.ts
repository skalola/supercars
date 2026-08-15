import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { isSignedIn: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, name: true, email: true, image: true, role: true },
  });

  if (!user) {
    return NextResponse.json(
      { isSignedIn: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const isAdmin = user.role === "ADMIN" || session.user.role === "ADMIN";
  const userLabel = user.username || user.name || user.email || "Profile";

  return NextResponse.json(
    {
      isSignedIn: true,
      isAdmin,
      userLabel,
      profileHref: isAdmin ? "/admin" : user.username ? `/garage/${user.username}` : "/garage",
      garageHref: user.username ? `/garage/${user.username}` : "/garage",
      trackersHref: !isAdmin && user.username ? `/garage/${user.username}/trackers` : null,
      profileImageUrl: isAdmin ? null : user.image || session.user.image || null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
