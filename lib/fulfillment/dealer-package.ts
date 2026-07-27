/**
 * lib/fulfillment/dealer-package.ts
 *
 * Sprint 7.3 Dealer Purchase Package Generator & Dispatch Engine.
 * Constructs structured dealer purchase package payloads and audits email notification dispatch.
 */

import { resolvePartnerContact } from "./partner-registry";

export interface GenerateDealerPackageParams {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  listingUrl?: string | null;
  listingSourceName?: string | null;
  externalListingId?: string | null;
  dealerName?: string | null;
  askingPrice: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  buyerMessage?: string | null;
  requestedTerms?: {
    financingRequired?: boolean;
    requestedDeliveryDate?: string | null;
    tradeInVin?: string | null;
  };
  decisionTokenUrl: string;
}

export function generateDealerPurchasePackagePayload(params: GenerateDealerPackageParams) {
  // Platform fee: 1% of asking price (minimum $1,000)
  const platformFee = Math.max(1000, Math.round(params.askingPrice * 0.01));

  return {
    vin: params.vin,
    year: params.year,
    make: params.make,
    model: params.model,
    trim: params.trim || "Base",
    listingUrl: params.listingUrl || "https://supercars.market",
    listingSourceName: params.listingSourceName || "SUPERCARS Inventory",
    externalListingId: params.externalListingId || "Not provided",
    dealerName: params.dealerName || params.listingSourceName || "Dealer Partner",
    askingPrice: params.askingPrice,
    buyerName: params.buyerName,
    buyerEmail: params.buyerEmail,
    buyerPhone: params.buyerPhone || "Not provided",
    buyerMessage: params.buyerMessage || "Interested in purchasing this vehicle via Supercars Marketplace.",
    requestedPurchaseTerms: {
      financingRequired: params.requestedTerms?.financingRequired ?? false,
      requestedDeliveryDate: params.requestedTerms?.requestedDeliveryDate || "Flexible",
      tradeInVin: params.requestedTerms?.tradeInVin || "None",
    },
    platformFee,
    depositStatus: "AUTHORIZED",
    decisionTokenUrl: params.decisionTokenUrl,
  };
}

export interface DispatchDealerEmailParams {
  fulfillmentRequestId: string;
  dealerName: string;
  dealerEmail?: string | null;
  decisionTokenUrl: string;
  packageTitle: string;
  vehicleSummary?: string;
  askingPrice?: number;
  buyerName?: string;
  buyerPhone?: string;
  platformFee?: number;
}

import { sendFulfillmentEmail } from "@/lib/mail/mail-service";

/**
 * Audits and dispatches dealer purchase email notification via central mail service.
 * Enforces Zero Guessed Emails Rule.
 */
export async function dispatchDealerPackageEmail(params: DispatchDealerEmailParams) {
  const resolvedPartner = await resolvePartnerContact({ name: params.dealerName, type: "DEALER" });
  const emailToUse = params.dealerEmail || resolvedPartner?.email;

  const result = await sendFulfillmentEmail({
    fulfillmentRequestId: params.fulfillmentRequestId,
    templateType: "DEALER_PURCHASE_REQUEST",
    recipientName: params.dealerName,
    recipientEmail: emailToUse,
    packageTitle: params.packageTitle,
    vehicleSummary: params.vehicleSummary || "Dealer Purchase Offer Vehicle",
    priceOrAmount: params.askingPrice,
    reviewUrl: params.decisionTokenUrl,
    acceptUrl: `${params.decisionTokenUrl}/accept`,
    declineUrl: `${params.decisionTokenUrl}/decline`,
    additionalDetails: {
      "Buyer Name": params.buyerName || "Verified Buyer",
      "Buyer Phone": params.buyerPhone || "N/A",
      "Platform Fee": params.platformFee ? `$${params.platformFee.toLocaleString()}` : "Pending final settlement",
    },
  });

  return {
    dispatched: result.dispatched,
    emailSentTo: result.recipientEmail || null,
    message: result.message,
  };
}
