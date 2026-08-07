"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isValidVin } from "@/lib/market-crawlers/vin-extractor";
import { createFulfillmentRequest } from "@/lib/fulfillment/service";
import { resolvePartnerContact } from "@/lib/fulfillment/partner-registry";
import {
  generateDealerPurchasePackagePayload,
} from "@/lib/fulfillment/dealer-package";
import {
  generateInsuranceQuotePackagePayload,
  dispatchInsurancePackageEmail,
} from "@/lib/fulfillment/insurance-package";
import {
  generateTransportPackagePayload,
  dispatchTransportPackageEmail,
} from "@/lib/fulfillment/transport-package";
import { isSupportedMake } from "@/lib/supported-makes";

async function getAuthenticatedUser() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in.");
  }
  return userId;
}

export interface CreateDealerPurchaseInput {
  listingId: string;
  amount: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerMessage?: string;
  requestedTerms?: {
    financingRequired?: boolean;
    requestedDeliveryDate?: string;
    tradeInVin?: string;
  };
}

export async function createDealerPurchasePackage(
  listingId: string | CreateDealerPurchaseInput,
  amountInput?: number
) {
  const userId = await getAuthenticatedUser();

  const input: CreateDealerPurchaseInput =
    typeof listingId === "string"
      ? { listingId, amount: amountInput || 0 }
      : listingId;

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: {
      vehicle: {
        include: {
          model: { include: { make: true } },
          owner: true,
        },
      },
      model: { include: { make: true } },
      source: true,
      seller: true,
    },
  });

  if (!listing) {
    throw new Error("Listing not found.");
  }

  const buyer = await prisma.user.findUnique({
    where: { id: userId },
  });

  // 1. Create Purchase Record (Status remains PENDING, NOT COMPLETED!)
  const purchase = await prisma.purchase.create({
    data: {
      listingId: input.listingId,
      buyerId: userId,
      amount: input.amount || listing.askingPrice || listing.price || 0,
      status: "PENDING", // Submission means SENT / PENDING, not COMPLETED
    },
  });

  if (!listing.vehicle || !isValidVin(listing.vehicle.vin)) {
    throw new Error("Dealer purchase packages require a valid VIN-backed supported supercar vehicle.");
  }

  const vin = listing.vehicle.vin;
  const year = listing.vehicle.year;
  const make = listing.vehicle.model.make.name;
  const model = listing.vehicle.model.name;
  const trim = listing.vehicle.trim || null;
  if (!isSupportedMake(make)) {
    throw new Error("Dealer purchase packages are only supported for supported supercar makes.");
  }

  const buyerName = input.buyerName || buyer?.name || buyer?.username || "Verified Buyer";
  const buyerEmail = input.buyerEmail || buyer?.email;
  if (!buyerEmail) {
    throw new Error("Buyer email is required to create a dealer purchase package.");
  }

  const localSeller = listing.seller || listing.vehicle.owner || null;
  const isSiteUserListing = !!listing.sellerId;
  const localSellerName =
    localSeller?.name || localSeller?.username || localSeller?.email || "SUPERCAR DASH owner";
  const localSellerEmail = localSeller?.email || null;

  // 2. Resolve recipient.
  // Site-user listings route directly to the claimed owner/seller.
  // Third-party inventory routes through the dealer directory resolver.
  const dealerName = isSiteUserListing
    ? localSellerName
    : listing.dealerName || listing.source?.name || "Dealer Partner";
  const resolvedDealer = isSiteUserListing
    ? null
    : await resolvePartnerContact({
        name: dealerName,
        marketSourceId: listing.source?.id || undefined,
        website: listing.url || undefined,
        type: "DEALER",
        allowDealerDomainFallback: true,
      });
  const recipientName = isSiteUserListing ? localSellerName : resolvedDealer?.name || dealerName;
  const recipientEmail = isSiteUserListing ? localSellerEmail : resolvedDealer?.email || null;

  // 3. Build Scoped Package Payload
  const packagePayload = generateDealerPurchasePackagePayload({
    vin,
    year,
    make,
    model,
    trim,
    listingUrl: isSiteUserListing ? `/vehicle/${vin}` : listing.url,
    listingSourceName: isSiteUserListing ? "SUPERCAR DASH Owner Listing" : listing.source?.name || null,
    externalListingId: listing.externalListingId || null,
    dealerName,
    askingPrice: input.amount || listing.askingPrice || listing.price || 0,
    buyerName,
    buyerEmail,
    buyerPhone: input.buyerPhone,
    buyerMessage: input.buyerMessage,
    requestedTerms: input.requestedTerms,
    decisionTokenUrl: "/fulfillment/{partnerDecisionToken}",
  });

  // 4. Create Fulfillment Request (DEALER_PURCHASE)
  const fulfillmentRequest = await createFulfillmentRequest({
    requestType: "DEALER_PURCHASE",
    purchaseId: purchase.id,
    vehicleId: listing.vehicleId || undefined,
    listingId: listing.id,
    buyerId: userId,
    packageTitle: `Purchase Package — ${year} ${make} ${model}`,
    packageDescription: `Official buyer purchase offer for ${year} ${make} ${model} (${vin})`,
    scopedPackageData: packagePayload,
    partnerName: resolvedDealer?.name || dealerName,
    partnerEmail: recipientEmail, // Site seller email or resolved audited dealer email; null holds as DRAFT.
    partnerType: "DEALER",
    partnerMarketSourceId:
      isSiteUserListing || resolvedDealer?.marketSourceId !== listing.source?.id ? null : listing.source?.id || null,
    status: "READY_TO_SEND",
    parties: [
      {
        partyType: "BUYER",
        userId,
        name: buyerName,
        email: buyerEmail,
      },
      {
        partyType: isSiteUserListing ? "SELLER" : "DEALER",
        userId: isSiteUserListing ? localSeller?.id : undefined,
        name: recipientName,
        email: recipientEmail || undefined,
      },
    ],
    fees: [
      {
        feeType: "DEPOSIT",
        amount: packagePayload.platformFee,
        status: "ESTIMATED",
        description: "Refundable purchase deposit due at final buyer checkout",
      },
      {
        feeType: "COMMISSION",
        amount: packagePayload.platformFee,
        status: "ESTIMATED",
        description: "SUPERCARS Marketplace Brokerage Fee",
      },
    ],
  });

  const partnerToken = fulfillmentRequest.partnerTokens[0]?.token;
  const decisionTokenUrl = partnerToken ? `/fulfillment/${partnerToken}` : "/fulfillment/{partnerDecisionToken}";

  // Update scoped package data with actual decision Token URL
  if (partnerToken && fulfillmentRequest.packages[0]) {
    packagePayload.decisionTokenUrl = decisionTokenUrl;
    await prisma.fulfillmentPackage.update({
      where: { id: fulfillmentRequest.packages[0].id },
      data: { scope: JSON.stringify(packagePayload) },
    });
  }

  return {
    id: purchase.id,
    purchaseId: purchase.id,
    fulfillmentRequestId: fulfillmentRequest.id,
    publicTransactionToken: fulfillmentRequest.publicTransactionToken,
    status: fulfillmentRequest.status,
  };
}

export interface CreateInsuranceQuoteInput {
  purchaseId: string;
  status?: "NOT_STARTED" | "REQUESTED" | "QUOTE_STARTED" | "COMPLETED";
  carrierName?: string;
  intendedUse?: string;
  coveragePreference?: string;
  garagingState?: string;
  garagingZip?: string;
}

export async function createInsuranceQuotePackage(
  purchaseIdInput: string | CreateInsuranceQuoteInput,
  statusInput?: "NOT_STARTED" | "REQUESTED" | "QUOTE_STARTED" | "COMPLETED"
) {
  const userId = await getAuthenticatedUser();

  const input: CreateInsuranceQuoteInput =
    typeof purchaseIdInput === "string"
      ? { purchaseId: purchaseIdInput, status: statusInput || "QUOTE_STARTED" }
      : purchaseIdInput;

  const purchase = await prisma.purchase.findUnique({
    where: { id: input.purchaseId },
    include: {
      listing: {
        include: {
          vehicle: { include: { model: { include: { make: true } } } },
          model: { include: { make: true } },
        },
      },
      buyer: true,
    },
  });

  if (!purchase) {
    throw new Error("Purchase order not found.");
  }

  const listing = purchase.listing;
  const vehicle = listing.vehicle;
  if (!vehicle || !isValidVin(vehicle.vin)) {
    throw new Error("Insurance quote packages require a valid VIN-backed supported supercar vehicle.");
  }

  const insuranceMake = vehicle.model.make.name;
  if (!isSupportedMake(insuranceMake)) {
    throw new Error("Insurance quote packages are only supported for supported supercar makes.");
  }

  const statusVal = input.status || "QUOTE_STARTED";

  // 1. Create or Update InsuranceRequest (Status is QUOTE_STARTED, NOT COMPLETED!)
  const insuranceReq = await prisma.insuranceRequest.upsert({
    where: { purchaseId: input.purchaseId },
    update: { status: statusVal },
    create: {
      purchaseId: input.purchaseId,
      userId,
      vehicleId: vehicle.id,
      status: statusVal,
    },
  });

  // 2. Resolve Insurance Partner Contact (defaults to Hagerty)
  const carrierName = input.carrierName || "Hagerty Private Client Insurance";
  const resolvedInsurer = await resolvePartnerContact({
    name: carrierName,
    type: "INSURER",
  });

  const buyerName = purchase.buyer?.name || purchase.buyer?.username || "Verified Buyer";
  const buyerEmail = purchase.buyer?.email;
  if (!buyerEmail) {
    throw new Error("Buyer email is required to create an insurance quote package.");
  }
  const agreedValue = purchase.amount || listing.askingPrice || listing.price || 250000;

  // 3. Build Standardized Insurance Quote Scoped Package Payload
  const quotePayload = generateInsuranceQuotePackagePayload({
    buyerName,
    buyerEmail,
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.model.make.name,
    model: vehicle.model.name,
    trim: vehicle.trim,
    agreedValue,
    garagingState: input.garagingState || "CA",
    garagingZip: input.garagingZip || "90210",
    intendedUse: input.intendedUse || "PLEASURE_COLLECTION",
    coveragePreference: input.coveragePreference || "AGREED_VALUE_FULL_COVERAGE",
    partnerName: resolvedInsurer?.name || carrierName,
  });

  // 4. Create Fulfillment Request (INSURANCE_QUOTE)
  const fulfillmentRequest = await createFulfillmentRequest({
    requestType: "INSURANCE_QUOTE",
    purchaseId: purchase.id,
    vehicleId: vehicle.id,
    listingId: listing.id,
    buyerId: userId,
    packageTitle: `Agreed Value Quote Request — ${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
    packageDescription: `Agreed value insurance quote request for ${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name} ($${agreedValue.toLocaleString()})`,
    scopedPackageData: quotePayload,
    partnerName: resolvedInsurer?.name || carrierName,
    // Enforce zero-guessed-emails: null triggers DRAFT hold if registry has no email
    partnerEmail: resolvedInsurer?.email || null,
    partnerType: "INSURER",
    status: "SENT",
    parties: [
      {
        partyType: "BUYER",
        userId,
        name: buyerName,
        email: buyerEmail,
      },
      {
        partyType: "INSURANCE_CARRIER",
        name: resolvedInsurer?.name || carrierName,
        // No guessed emails — undefined if not resolved from registry
        email: resolvedInsurer?.email || undefined,
      },
    ],
    fees: [
      {
        feeType: "REFERRAL_FEE",
        amount: 250,
        status: "ESTIMATED",
        description: "Specialty Insurance Referral Commission (PENDING_BIND)",
      },
    ],
  });

  // 5. Audit & Dispatch Insurance Quote Request Email
  const tokenObj = fulfillmentRequest.partnerTokens?.[0];
  const decisionTokenUrl = tokenObj ? `/fulfillment/${tokenObj.token}` : `/transactions/${fulfillmentRequest.id}`;

  await dispatchInsurancePackageEmail({
    fulfillmentRequestId: fulfillmentRequest.id,
    carrierName: resolvedInsurer?.name || carrierName,
    // null = mail-service will handle DRAFT hold logging
    carrierEmail: resolvedInsurer?.email || null,
    decisionTokenUrl,
    packageTitle: fulfillmentRequest.packages?.[0]?.title || `Agreed Value Quote Request — ${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
    vehicleSummary: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name} (VIN: ${vehicle.vin})`,
    agreedValue,
    buyerName,
  });

  return {
    id: insuranceReq.id,
    status: insuranceReq.status,
    fulfillmentRequestId: fulfillmentRequest.id,
    publicTransactionToken: fulfillmentRequest.publicTransactionToken,
  };
}

export interface CreateTransportQuoteInput {
  purchaseId: string;
  address: { streetAddress: string; city: string; state: string; postalCode: string };
  transportMethod?: "ENCLOSED" | "STANDARD" | "OPEN";
  deliveryDate?: string;
  transporterName?: string;
  operableStatus?: "RUNNING" | "NON_RUNNING";
  buyerPhone?: string;
  estimatedTransportPrice?: number;
  depositAmount?: number;
}

export async function createTransportQuotePackage(
  purchaseIdInput: string | CreateTransportQuoteInput,
  addressInput?: { streetAddress: string; city: string; state: string; postalCode: string },
  transportMethodInput?: CreateTransportQuoteInput["transportMethod"],
  deliveryDateInput?: string
) {
  const userId = await getAuthenticatedUser();

  const input: CreateTransportQuoteInput =
    typeof purchaseIdInput === "string"
      ? {
          purchaseId: purchaseIdInput,
          address: addressInput || { streetAddress: "", city: "", state: "", postalCode: "" },
          transportMethod: transportMethodInput || "ENCLOSED",
          deliveryDate: deliveryDateInput || "Flexible",
        }
      : purchaseIdInput;

  const purchase = await prisma.purchase.findUnique({
    where: { id: input.purchaseId },
    include: {
      listing: {
        include: {
          vehicle: { include: { model: { include: { make: true } } } },
          model: { include: { make: true } },
          source: true,
        },
      },
      buyer: true,
    },
  });

  if (!purchase) {
    throw new Error("Purchase order not found.");
  }

  const listing = purchase.listing;
  const vehicle = listing.vehicle;
  if (!vehicle || !isValidVin(vehicle.vin)) {
    throw new Error("Transport quote packages require a valid VIN-backed supported supercar vehicle.");
  }

  const transportMake = vehicle.model.make.name;
  if (!isSupportedMake(transportMake)) {
    throw new Error("Transport quote packages are only supported for supported supercar makes.");
  }

  const { streetAddress, city, state, postalCode } = input.address;
  if (!streetAddress || !city || !state || !postalCode) {
    throw new Error("Complete delivery address is required to create a transport quote package.");
  }

  const carrierType = input.transportMethod === "STANDARD" || input.transportMethod === "OPEN" ? "OPEN" : "ENCLOSED";
  const estimatedTransportPrice = input.estimatedTransportPrice || (carrierType === "OPEN" ? 1250 : 1850);
  const depositAmount = input.depositAmount || 500;

  // 1. Create or Update DeliveryRequest Record (Status is REQUESTED)
  const deliveryReq = await prisma.deliveryRequest.upsert({
    where: { purchaseId: input.purchaseId },
    update: {
      street: streetAddress,
      city,
      state,
      postalCode,
      transportMethod: carrierType,
      deliveryDate: input.deliveryDate || "Flexible",
      status: "REQUESTED",
    },
    create: {
      purchaseId: input.purchaseId,
      userId,
      vehicleId: vehicle.id,
      status: "REQUESTED",
      street: streetAddress,
      city,
      state,
      postalCode,
      transportMethod: carrierType,
      deliveryDate: input.deliveryDate || "Flexible",
    },
  });

  // 2. Resolve Transporter Partner Contact (defaults to Reliable Carriers Enclosed Transport)
  const transporterName = input.transporterName || "Reliable Carriers Enclosed Transport";
  const resolvedTransporter = await resolvePartnerContact({
    name: transporterName,
    type: "TRANSPORTER",
  });

  const pickupLocation = listing.dealerName || listing.location || listing.source?.name || "Dealer Showroom / Warehouse";
  const buyerName = purchase.buyer?.name || purchase.buyer?.username || "Verified Buyer";
  const buyerEmail = purchase.buyer?.email;
  if (!buyerEmail) {
    throw new Error("Buyer email is required to create a transport quote package.");
  }

  // 3. Build Standardized Transport Quote Scoped Package Payload
  const transportPayload = generateTransportPackagePayload({
    pickupLocation,
    deliveryStreet: streetAddress,
    deliveryCity: city,
    deliveryState: state,
    deliveryPostalCode: postalCode,
    vin: vehicle.vin,
    year: vehicle.year,
    make: transportMake,
    model: vehicle.model.name,
    operableStatus: input.operableStatus || "RUNNING",
    preferredDeliveryDate: input.deliveryDate || "Flexible",
    carrierType,
    buyerName,
    buyerEmail,
    buyerPhone: input.buyerPhone,
    estimatedTransportPrice,
    depositAmount,
    pickupContactName: listing.dealerName || listing.source?.name || null,
    deliveryContactName: buyerName,
  });

  // 4. Create Fulfillment Request (TRANSPORT_QUOTE) with Deposit Hold (AUTHORIZATION ONLY!)
  const fulfillmentRequest = await createFulfillmentRequest({
    requestType: "TRANSPORT_QUOTE",
    purchaseId: purchase.id,
    vehicleId: vehicle.id,
    listingId: listing.id,
    buyerId: userId,
    packageTitle: `${carrierType === "ENCLOSED" ? "Enclosed" : "Open"} Transport Request — ${vehicle.year} ${transportMake} ${vehicle.model.name}`,
    packageDescription: `${carrierType === "ENCLOSED" ? "Enclosed" : "Open"} carrier route transport request from ${pickupLocation} to ${city}, ${state}`,
    scopedPackageData: transportPayload,
    partnerName: resolvedTransporter?.name || transporterName,
    // Enforce zero-guessed-emails: null triggers DRAFT hold if registry has no email
    partnerEmail: resolvedTransporter?.email || null,
    partnerType: "TRANSPORTER",
    status: "SENT",
    parties: [
      {
        partyType: "BUYER",
        userId,
        name: buyerName,
        email: buyerEmail,
      },
      {
        partyType: "TRANSPORT_PROVIDER",
        name: resolvedTransporter?.name || transporterName,
        // No guessed emails — undefined if not resolved from registry
        email: resolvedTransporter?.email || undefined,
      },
    ],
    depositIntent: {
      amount: depositAmount, // Authorization hold only — NO money captured before acceptance!
      paymentMethod: "CREDIT_CARD_HOLD",
    },
    fees: [
      {
        feeType: "TRANSPORT_FEE",
        amount: estimatedTransportPrice,
        status: "ESTIMATED",
        description: `${carrierType === "ENCLOSED" ? "Enclosed" : "Open"} Carrier Haul Rate (Pending Partner Acceptance)`,
      },
      {
        feeType: "DEPOSIT",
        amount: depositAmount,
        status: "AUTHORIZED",
        description: "Transport Route Authorization Hold (Released if Declined)",
      },
    ],
  });

  // 5. Audit & Dispatch Transport Request Email
  const tokenObj = fulfillmentRequest.partnerTokens?.[0];
  const decisionTokenUrl = tokenObj ? `/fulfillment/${tokenObj.token}` : `/transactions/${fulfillmentRequest.id}`;

  await dispatchTransportPackageEmail({
    fulfillmentRequestId: fulfillmentRequest.id,
    transporterName: resolvedTransporter?.name || transporterName,
    // null = mail-service handles DRAFT hold logging
    transporterEmail: resolvedTransporter?.email || null,
    decisionTokenUrl,
    packageTitle: fulfillmentRequest.packages?.[0]?.title || `${carrierType === "ENCLOSED" ? "Enclosed" : "Open"} Transport Request — ${vehicle.year} ${transportMake} ${vehicle.model.name}`,
    vehicleSummary: `${vehicle.year} ${transportMake} ${vehicle.model.name} (VIN: ${vehicle.vin})`,
    estimatedPrice: estimatedTransportPrice,
    depositAmount,
    buyerName,
    buyerPhone: input.buyerPhone,
  });

  return {
    id: deliveryReq.id,
    status: deliveryReq.status,
    fulfillmentRequestId: fulfillmentRequest.id,
    publicTransactionToken: fulfillmentRequest.publicTransactionToken,
  };
}
