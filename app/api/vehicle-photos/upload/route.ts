import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit, isActionRateLimitError } from "@/lib/security/action-rate-limit";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";

const MAX_VEHICLE_PHOTO_BYTES = 8 * 1024 * 1024;

const clientPayloadSchema = z.object({
  vin: vinClaimSchema,
}).strict();

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid vehicle photo upload request." }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) throw new Error("Sign in to upload vehicle photos.");

        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(clientPayload || "{}");
        } catch {
          throw new Error("Invalid vehicle photo upload context.");
        }
        const { vin } = clientPayloadSchema.parse(parsedPayload);
        const vehicle = await prisma.vehicle.findUnique({
          where: { vin },
          select: { id: true, ownerId: true, status: true },
        });
        if (!vehicle || vehicle.ownerId !== userId || vehicle.status !== "CLAIMED") {
          throw new Error("You do not own this claimed vehicle.");
        }

        const expectedPrefix = `vehicles/${vehicle.id}/photos/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid vehicle photo upload destination.");
        }

        await enforceActionRateLimit({
          actorId: userId,
          action: "vehicle_upload_token",
          bucketKey: vehicle.id,
          limit: 30,
          windowMs: 60 * 60 * 1000,
        });

        return {
          allowedContentTypes: ["image/jpeg", "image/png"],
          maximumSizeInBytes: MAX_VEHICLE_PHOTO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const status = isActionRateLimitError(error) ? 429 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Vehicle photo upload failed." },
      { status },
    );
  }
}
