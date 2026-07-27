/**
 * lib/fulfillment/service-booking-package.ts
 *
 * Sprint 7.6 / Sprint 7F Service Booking Package Generator & Dispatcher.
 * Constructs standardized service booking package payloads connecting Vehicle Passport records
 * directly to partner service centers with refundable deposit authorization rules,
 * and dispatches partner appointment request notifications.
 */

import { resolvePartnerContact } from "./partner-registry";
import { sendFulfillmentEmail } from "@/lib/mail/mail-service";

export interface GenerateServiceBookingPackageParams {
  vin: string;
  year: number;
  make: string;
  model: string;
  currentMileage?: number | null;
  passportHealthScore?: number | null;
  serviceRequested: string;
  preferredDate: string;
  preferredTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  shopName: string;
  shopEmail?: string | null;
  notes?: string | null;
  attachedDocumentCount?: number;
  depositAmount?: number;
}

export function generateServiceBookingPackagePayload(params: GenerateServiceBookingPackageParams) {
  const depositAmount = params.depositAmount || 100; // Refundable booking authorization hold

  return {
    vehicle: {
      vin: params.vin,
      year: params.year,
      make: params.make,
      model: params.model,
      currentMileage: params.currentMileage || 0,
      passportHealthScore: params.passportHealthScore || 100,
    },
    serviceRequested: params.serviceRequested,
    mileage: params.currentMileage || 0,
    preferredSchedule: {
      preferredDate: params.preferredDate,
      preferredTime: params.preferredTime,
    },
    customerContact: {
      name: params.customerName,
      email: params.customerEmail,
      phone: params.customerPhone || "Not provided",
    },
    shop: {
      name: params.shopName,
      email: params.shopEmail || "UNRESOLVED_EMAIL",
    },
    depositFeeRules: {
      depositAmount,
      currency: "USD",
      status: "AUTHORIZED",
      rule: "REFUNDABLE_AUTHORIZATION_BEFORE_ACCEPTANCE",
      explanation: "Booking fee is authorized on hold. Funds are captured only when shop accepts appointment.",
    },
    notesAndDocuments: {
      customerNotes: params.notes || "Standard service request from Vehicle Passport.",
      attachedDocumentCount: params.attachedDocumentCount || 0,
    },
  };
}

export interface DispatchServiceEmailParams {
  fulfillmentRequestId: string;
  shopName: string;
  shopEmail?: string | null;
  decisionTokenUrl: string;
  packageTitle: string;
  vehicleSummary?: string;
  serviceName?: string;
  customerName?: string;
  customerPhone?: string;
  depositAmount?: number;
}

/**
 * Audits and dispatches service booking email notification via central mail service.
 * Enforces Zero Guessed Emails Rule.
 */
export async function dispatchServiceBookingEmail(params: DispatchServiceEmailParams) {
  const resolvedPartner = await resolvePartnerContact({ name: params.shopName, type: "SERVICE_SHOP" });
  const emailToUse = params.shopEmail || resolvedPartner?.email;

  const result = await sendFulfillmentEmail({
    fulfillmentRequestId: params.fulfillmentRequestId,
    templateType: "SERVICE_BOOKING_REQUEST",
    recipientName: params.shopName,
    recipientEmail: emailToUse,
    packageTitle: params.packageTitle,
    vehicleSummary: params.vehicleSummary || "Vehicle Passport Service Booking",
    reviewUrl: params.decisionTokenUrl,
    acceptUrl: `${params.decisionTokenUrl}/accept`,
    declineUrl: `${params.decisionTokenUrl}/decline`,
    additionalDetails: {
      "Service Requested": params.serviceName || "Certified Maintenance",
      "Customer Name": params.customerName || "Vehicle Owner",
      "Customer Phone": params.customerPhone || "N/A",
      "Booking Deposit": `$${(params.depositAmount || 100).toLocaleString()} (RELEASED_IF_DECLINED)`,
    },
  });

  return {
    dispatched: result.dispatched,
    emailSentTo: result.recipientEmail || null,
    message: result.message,
  };
}
