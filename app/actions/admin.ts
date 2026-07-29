"use server";

/**
 * app/actions/admin.ts
 *
 * Server actions for Sprint 8.0 Internal Operations Review Layer.
 * Provides admin actions: resend email, cancel/refund, mark completed manually.
 */

import { revalidatePath } from "next/cache";
import {
  resendFulfillmentEmailAdmin,
  adminCancelAndRefund,
  adminMarkCompleted,
  adminProcessExpiredPartnerRequests,
  adminReleaseRefund,
  adminDeleteFulfillmentRequest,
} from "@/lib/admin/fulfillment-ops";
import { assertAdmin } from "@/lib/admin/auth";

export async function resendEmailAction(requestId: string) {
  try {
    await assertAdmin();
    const result = await resendFulfillmentEmailAdmin(requestId);
    revalidatePath("/admin/fulfillment");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resend email.";
    return { success: false, message };
  }
}

export async function adminCancelAction(requestId: string, reason: string) {
  try {
    await assertAdmin();
    const result = await adminCancelAndRefund(requestId, reason);
    revalidatePath("/admin/fulfillment");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel request.";
    return { success: false, message };
  }
}

export async function adminCompleteAction(requestId: string, note?: string) {
  try {
    await assertAdmin();
    const result = await adminMarkCompleted(requestId, note);
    revalidatePath("/admin/fulfillment");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark completed.";
    return { success: false, message };
  }
}

export async function adminProcessExpiredAction() {
  try {
    await assertAdmin();
    const result = await adminProcessExpiredPartnerRequests();
    revalidatePath("/admin/fulfillment");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process expired requests.";
    return { success: false, processedCount: 0, message };
  }
}

export async function adminReleaseRefundAction(requestId: string, note?: string) {
  try {
    await assertAdmin();
    const result = await adminReleaseRefund(requestId, note);
    revalidatePath("/admin/fulfillment");
    revalidatePath("/transactions");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to release or refund payment.";
    return { success: false, message };
  }
}

export async function adminDeleteFulfillmentAction(requestId: string) {
  try {
    await assertAdmin();
    const result = await adminDeleteFulfillmentRequest(requestId);
    revalidatePath("/admin/fulfillment");
    revalidatePath("/admin/overview");
    revalidatePath("/transactions");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete fulfillment transaction.";
    return { success: false, message };
  }
}
