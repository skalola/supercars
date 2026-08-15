"use server";

/**
 * app/actions/admin-partner.ts
 *
 * Sprint 7B Admin Partner Contact Resolution Server Actions.
 */

import { revalidatePath } from "next/cache";
import {
  resolveUnresolvedPartnerContact,
  upsertPartnerContact,
} from "@/lib/fulfillment/partner-registry";
import type { ContactSource, PartnerConfidence, PartnerType } from "@/lib/fulfillment/partner-registry";
import { assertAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import {
  addVendorInputSchema,
  adminRecordIdSchema,
  resolvePartnerEmailInputSchema,
} from "@/lib/validation/admin-inputs";
import { validationMessage } from "@/lib/validation/common-inputs";

type AddVendorInput = {
  name: string;
  type: PartnerType;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  makeSpecialization?: string | null;
};

export async function resolvePartnerEmailAction(
  partnerContactId: string,
  newEmail: string,
  confidence: PartnerConfidence = "MANUAL_REVIEW",
  source: ContactSource = "MANUALLY_VERIFIED"
) {
  try {
    await assertAdmin();
    const parsed = resolvePartnerEmailInputSchema.safeParse({
      partnerContactId,
      newEmail,
      confidence,
      source,
    });
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    const result = await resolveUnresolvedPartnerContact(
      parsed.data.partnerContactId,
      parsed.data.newEmail,
      parsed.data.confidence,
      parsed.data.source
    );
    revalidatePath("/admin/partners");
    revalidatePath("/admin/fulfillment");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve partner email.";
    return { success: false, message };
  }
}

export async function addVendorAction(input: AddVendorInput) {
  try {
    await assertAdmin();

    const parsed = addVendorInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    const { name, type, email, phone, website, location, makeSpecialization } = parsed.data;

    const vendor = await upsertPartnerContact({
      name,
      type,
      email,
      phone,
      website,
      location,
      makeSpecialization,
      active: true,
      confidence: email ? "MANUAL_REVIEW" : "UNRESOLVED_EMAIL",
      contactSource: "MANUALLY_VERIFIED",
    });

    revalidatePath("/admin/partners");
    revalidatePath("/admin/overview");
    revalidatePath("/directory");

    return { success: true, message: `Saved ${vendor.name}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add vendor.";
    return { success: false, message };
  }
}

export async function removeVendorAction(partnerContactId: string) {
  try {
    await assertAdmin();
    const parsedId = adminRecordIdSchema.safeParse(partnerContactId);
    if (!parsedId.success) return { success: false, message: validationMessage(parsedId.error) };
    partnerContactId = parsedId.data;

    const vendor = await prisma.partnerContact.findUnique({
      where: { id: partnerContactId },
      include: {
        marketSource: true,
        fulfillmentParties: {
          select: { id: true },
        },
      },
    });

    if (!vendor) {
      return { success: false, message: "Vendor not found." };
    }

    const hasOperationalHistory = vendor.fulfillmentParties.length > 0 || Boolean(vendor.marketSource);

    if (hasOperationalHistory) {
      await prisma.partnerContact.update({
        where: { id: partnerContactId },
        data: { active: false },
      });
    } else {
      await prisma.partnerContact.delete({
        where: { id: partnerContactId },
      });
    }

    revalidatePath("/admin/partners");
    revalidatePath("/admin/overview");
    revalidatePath("/directory");

    return {
      success: true,
      message: hasOperationalHistory
        ? `Deactivated ${vendor.name} because it has operational history.`
        : `Removed ${vendor.name}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove vendor.";
    return { success: false, message };
  }
}
