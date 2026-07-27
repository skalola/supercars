/**
 * lib/fulfillment/insurance-package.ts
 *
 * Sprint 7.4 / Sprint 7D Insurance Referral Package Generator & Dispatcher.
 * Constructs standardized agreed value quote package payloads for specialty insurers,
 * manages referral commission tracking metadata, and dispatches partner quote request notifications.
 */

import { resolvePartnerContact } from "./partner-registry";
import { sendFulfillmentEmail } from "@/lib/mail/mail-service";

export interface GenerateInsurancePackageParams {
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  buyerAddress?: string | null;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  agreedValue: number;
  garagingState?: string | null;
  garagingZip?: string | null;
  intendedUse?: string | null;
  coveragePreference?: string | null;
  quoteDeadlineDays?: number;
  partnerName?: string;
}

export function generateInsuranceQuotePackagePayload(params: GenerateInsurancePackageParams) {
  const deadlineDate = new Date(Date.now() + (params.quoteDeadlineDays || 2) * 24 * 60 * 60 * 1000);
  const estimatedCommission = 250; // Standard $250 referral fee for specialty supercar policy

  return {
    buyerContact: {
      name: params.buyerName,
      email: params.buyerEmail,
      phone: params.buyerPhone || "Not provided",
      address: params.buyerAddress || "On file",
    },
    vehicle: {
      vin: params.vin,
      year: params.year,
      make: params.make,
      model: params.model,
      trim: params.trim || "Base",
    },
    agreedValue: params.agreedValue,
    garagingLocation: {
      state: params.garagingState || "CA",
      zipCode: params.garagingZip || "90210",
    },
    intendedUse: params.intendedUse || "PLEASURE_COLLECTION",
    coveragePreference: params.coveragePreference || "AGREED_VALUE_FULL_COVERAGE",
    requestedQuoteDeadline: deadlineDate.toISOString().split("T")[0],
    referralCommissionMetadata: {
      estimatedCommission,
      currency: "USD",
      status: "PENDING_BIND",
      partnerName: params.partnerName || "Hagerty Private Client Insurance",
    },
  };
}

export interface DispatchInsuranceEmailParams {
  fulfillmentRequestId: string;
  carrierName: string;
  carrierEmail?: string | null;
  decisionTokenUrl: string;
  packageTitle: string;
  vehicleSummary?: string;
  agreedValue?: number;
  buyerName?: string;
  buyerPhone?: string;
}

/**
 * Audits and dispatches insurance quote request email notification via central mail service.
 * Enforces Zero Guessed Emails Rule.
 */
export async function dispatchInsurancePackageEmail(params: DispatchInsuranceEmailParams) {
  const resolvedPartner = await resolvePartnerContact({ name: params.carrierName, type: "INSURER" });
  const emailToUse = params.carrierEmail || resolvedPartner?.email;

  const result = await sendFulfillmentEmail({
    fulfillmentRequestId: params.fulfillmentRequestId,
    templateType: "INSURANCE_QUOTE_REQUEST",
    recipientName: params.carrierName,
    recipientEmail: emailToUse,
    packageTitle: params.packageTitle,
    vehicleSummary: params.vehicleSummary || "Agreed Value Vehicle Policy Request",
    priceOrAmount: params.agreedValue,
    reviewUrl: params.decisionTokenUrl,
    acceptUrl: `${params.decisionTokenUrl}/accept`,
    declineUrl: `${params.decisionTokenUrl}/decline`,
    additionalDetails: {
      "Buyer Name": params.buyerName || "Verified Buyer",
      "Buyer Phone": params.buyerPhone || "N/A",
      "Referral Fee": "$250 (PENDING_BIND)",
    },
  });

  return {
    dispatched: result.dispatched,
    emailSentTo: result.recipientEmail || null,
    message: result.message,
  };
}
