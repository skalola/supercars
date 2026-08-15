import { auth } from "@/auth";
import { readPrivateFile } from "@/lib/media/upload-storage";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = session?.user?.role;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const document = await prisma.vehicleDocument.findUnique({
    where: { id },
    select: {
      title: true,
      filePath: true,
      vehicle: { select: { ownerId: true } },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (document.vehicle.ownerId !== userId && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const file = await readPrivateFile(document.filePath);
  if (!file) {
    return NextResponse.json({ error: "Document file not found" }, { status: 404 });
  }

  const filename = `${sanitizeFilename(document.title)}.${file.extension}`;
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });
  if (file.size) headers.set("Content-Length", String(file.size));

  return new Response(file.body, { status: 200, headers });
}

function sanitizeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "vehicle-document";
}
