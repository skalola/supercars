/**
 * lib/fulfillment/transport-package.ts
 *
 * Sprint 7.5 / Sprint 7E Enclosed Transport Request Package Generator & Dispatcher.
 * Constructs standardized transport request payloads for vehicle transporters,
 * manages deposit authorization hold rules (no money captured before acceptance),
 * and dispatches partner transport request notifications.
 */

import { resolvePartnerContact } from "./partner-registry";
import { sendFulfillmentEmail } from "@/lib/mail/mail-service";

export interface GenerateTransportPackageParams {
  pickupLocation: string;
  deliveryStreet: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostalCode: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  operableStatus?: "RUNNING" | "NON_RUNNING";
  preferredDeliveryDate?: string | null;
  carrierType?: "ENCLOSED" | "OPEN";
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  estimatedTransportPrice?: number;
  depositAmount?: number;
  pickupContactName?: string | null;
  deliveryContactName?: string | null;
}

export function generateTransportPackagePayload(params: GenerateTransportPackageParams) {
  const estimatedPrice = params.estimatedTransportPrice || 1850;
  const depositAmount = params.depositAmount || 500;

  return {
    pickupLocation: params.pickupLocation,
    pickupContact: params.pickupContactName || "Dealer / seller contact",
    deliveryLocation: {
      street: params.deliveryStreet,
      city: params.deliveryCity,
      state: params.deliveryState,
      postalCode: params.deliveryPostalCode,
    },
    deliveryContact: params.deliveryContactName || params.buyerName,
    vehicle: {
      vin: params.vin,
      year: params.year,
      make: params.make,
      model: params.model,
    },
    operableStatus: params.operableStatus || "RUNNING",
    preferredDeliveryDate: params.preferredDeliveryDate || "Flexible",
    carrierType: params.carrierType || "ENCLOSED",
    buyerContact: {
      name: params.buyerName,
      email: params.buyerEmail,
      phone: params.buyerPhone || "Not provided",
    },
    estimatedTransportPrice: estimatedPrice,
    depositFeeRules: {
      depositAmount,
      currency: "USD",
      status: "AUTHORIZED",
      rule: "NO_FEE_BEFORE_ACCEPTANCE",
      explanation: "Deposit is authorized on hold. Funds are captured only when transporter accepts the route.",
    },
  };
}

export interface DispatchTransportEmailParams {
  fulfillmentRequestId: string;
  transporterName: string;
  transporterEmail?: string | null;
  decisionTokenUrl: string;
  packageTitle: string;
  vehicleSummary?: string;
  estimatedPrice?: number;
  depositAmount?: number;
  buyerName?: string;
  buyerPhone?: string;
}

/**
 * Audits and dispatches transport quote request email notification via central mail service.
 * Enforces Zero Guessed Emails Rule.
 */
export async function dispatchTransportPackageEmail(params: DispatchTransportEmailParams) {
  const resolvedPartner = await resolvePartnerContact({ name: params.transporterName, type: "TRANSPORTER" });
  const emailToUse = params.transporterEmail || resolvedPartner?.email;

  const result = await sendFulfillmentEmail({
    fulfillmentRequestId: params.fulfillmentRequestId,
    templateType: "TRANSPORT_REQUEST",
    recipientName: params.transporterName,
    recipientEmail: emailToUse,
    packageTitle: params.packageTitle,
    vehicleSummary: params.vehicleSummary || "Enclosed Carrier Transport Request",
    priceOrAmount: params.estimatedPrice,
    reviewUrl: params.decisionTokenUrl,
    acceptUrl: `${params.decisionTokenUrl}/accept`,
    declineUrl: `${params.decisionTokenUrl}/decline`,
    additionalDetails: {
      "Buyer Name": params.buyerName || "Verified Buyer",
      "Buyer Phone": params.buyerPhone || "N/A",
      "Deposit Hold": `$${(params.depositAmount || 500).toLocaleString()} (RELEASED_IF_DECLINED)`,
    },
  });

  return {
    dispatched: result.dispatched,
    emailSentTo: result.recipientEmail || null,
    message: result.message,
  };
}
