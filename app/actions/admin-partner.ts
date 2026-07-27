"use server";

/**
 * app/actions/admin-partner.ts
 *
 * Sprint 7B Admin Partner Contact Resolution Server Actions.
 */

import { revalidatePath } from "next/cache";
import {
  resolveUnresolvedPartnerContact,
  PartnerConfidence,
  ContactSource,
} from "@/lib/fulfillment/partner-registry";
import { assertAdmin } from "@/lib/admin/auth";

export async function resolvePartnerEmailAction(
  partnerContactId: string,
  newEmail: string,
  confidence: PartnerConfidence = "MANUAL_REVIEW",
  source: ContactSource = "MANUALLY_VERIFIED"
) {
  try {
    await assertAdmin();
    const result = await resolveUnresolvedPartnerContact(
      partnerContactId,
      newEmail,
      confidence,
      source
    );
    revalidatePath("/admin/partners");
    revalidatePath("/admin/fulfillment");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve partner email.";
    return { success: false, message };
  }
}
