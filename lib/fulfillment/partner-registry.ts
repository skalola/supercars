/**
 * lib/fulfillment/partner-registry.ts
 *
 * Sprint 7B Partner Contact Registry Engine.
 * Manages dynamic partner contact records (DEALER, INSURER, TRANSPORTER, SERVICE_SHOP),
 * tracks contact sources (IMPORTED_LISTING, PUBLIC_WEBSITE, MANUALLY_VERIFIED),
 * enforces confidence levels (VERIFIED, PUBLIC_SOURCE, MANUAL_REVIEW),
 * and handles admin resolution with automatic dispatch of held DRAFT requests.
 *
 * Zero-Guessed-Email Rule:
 *   If no valid email is known for a partner, contactStatus = UNRESOLVED_EMAIL.
 *   The fulfillment request is held as DRAFT until an admin resolves the email.
 *   No email is ever sent to a guessed or assumed address.
 */

import { prisma } from "@/lib/prisma";
import { normalizePartnerLocation, normalizePhoneNumber } from "@/lib/directory/partner-contact-format";

export type PartnerType = "DEALER" | "INSURER" | "TRANSPORTER" | "SERVICE_SHOP";
export type PartnerConfidence = "VERIFIED" | "PUBLIC_SOURCE" | "MANUAL_REVIEW" | "UNRESOLVED_EMAIL";
export type ContactSource = "IMPORTED_LISTING" | "PUBLIC_WEBSITE" | "MANUALLY_VERIFIED";
export type ContactStatus = "RESOLVED" | "UNRESOLVED_EMAIL";

export interface UpsertPartnerContactInput {
  name: string;
  type: PartnerType;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  sourceDomain?: string | null;
  makeSpecialization?: string;
  location?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  active?: boolean;
  confidence?: PartnerConfidence;
  contactSource?: ContactSource;
  marketSourceId?: string | null;
}

/**
 * Validates email format strictly. Returns true only for valid email syntax.
 * Rejects @example.com, .local, and dummy/test domains.
 */
export function isValidEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  // Block test/placeholder domains
  if (
    trimmed.endsWith("@example.com") ||
    trimmed.endsWith("@example.test") ||
    trimmed.endsWith(".local") ||
    trimmed.includes("dummy") ||
    trimmed.endsWith("@test.com") ||
    trimmed.endsWith("@supercars.test")
  ) {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

/**
 * Upserts a PartnerContact record.
 * Enforces UNRESOLVED_EMAIL status if no valid email is provided.
 * Matches existing contacts by name, sourceDomain, or marketSourceId.
 */
export async function upsertPartnerContact(input: UpsertPartnerContactInput) {
  const emailValid = isValidEmail(input.email);
  const cleanEmail = emailValid ? input.email!.trim().toLowerCase() : null;
  const cleanPhone = normalizePhoneNumber(input.phone);
  const location = normalizePartnerLocation(input);
  const contactStatus: ContactStatus = cleanEmail ? "RESOLVED" : "UNRESOLVED_EMAIL";
  const confidence: PartnerConfidence = cleanEmail
    ? input.confidence || "PUBLIC_SOURCE"
    : "UNRESOLVED_EMAIL";
  const contactSource: ContactSource =
    input.contactSource || (input.marketSourceId ? "IMPORTED_LISTING" : "PUBLIC_WEBSITE");

  // Derive domain from website if sourceDomain not supplied
  let sourceDomain = input.sourceDomain || null;
  if (!sourceDomain && input.website) {
    try {
      sourceDomain = new URL(input.website).hostname.replace(/^www\./, "");
    } catch {
      // keep null
    }
  }

  const existing = await prisma.partnerContact.findFirst({
    where: {
      type: input.type,
      OR: [
        { name: input.name },
        ...(sourceDomain ? [{ sourceDomain }] : []),
        ...(input.marketSourceId ? [{ marketSourceId: input.marketSourceId }] : []),
      ],
    },
  });

  if (existing) {
    // Prefer new email if valid; otherwise preserve existing verified email
    const finalEmail = cleanEmail || (existing.email && isValidEmail(existing.email) ? existing.email : null);
    const finalStatus: ContactStatus = finalEmail ? "RESOLVED" : "UNRESOLVED_EMAIL";
    const finalConfidence: PartnerConfidence = finalEmail
      ? input.confidence || (existing.confidence as PartnerConfidence) || "PUBLIC_SOURCE"
      : "UNRESOLVED_EMAIL";

    return prisma.partnerContact.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        type: input.type,
        email: finalEmail,
        phone: cleanPhone || existing.phone,
        website: input.website || existing.website,
        sourceDomain: sourceDomain || existing.sourceDomain,
        makeSpecialization: input.makeSpecialization || existing.makeSpecialization,
        location: location.location || existing.location,
        streetAddress: location.streetAddress || existing.streetAddress,
        city: location.city || existing.city,
        state: location.state || existing.state,
        postalCode: location.postalCode || existing.postalCode,
        country: input.country || existing.country || "US",
        latitude: input.latitude ?? existing.latitude,
        longitude: input.longitude ?? existing.longitude,
        active: input.active !== undefined ? input.active : existing.active,
        contactSource,
        confidence: finalConfidence,
        contactStatus: finalStatus,
        lastVerifiedAt: new Date(),
        marketSourceId: input.marketSourceId || existing.marketSourceId,
      },
    });
  }

  return prisma.partnerContact.create({
    data: {
      name: input.name,
      type: input.type,
      email: cleanEmail,
      phone: cleanPhone,
      website: input.website || null,
      sourceDomain,
      makeSpecialization: input.makeSpecialization || "ALL",
      location: location.location,
      streetAddress: location.streetAddress,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      country: input.country || "US",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      active: input.active !== undefined ? input.active : true,
      contactSource,
      confidence,
      contactStatus,
      lastVerifiedAt: new Date(),
      marketSourceId: input.marketSourceId || null,
    },
  });
}

/**
 * Resolves a PartnerContact from DB.
 *
 * Lookup priority:
 *   1. marketSourceId (strongest — direct DB link from imported listing source)
 *   2. sourceDomain (derived from listing URL — reliable for dealer routing)
 *   3. name (display name match)
 *
 * Type filter is applied when provided to prevent cross-type collisions.
 * Only returns active contacts.
 */
export async function resolvePartnerContact(params: {
  name?: string;
  marketSourceId?: string;
  website?: string;
  type?: PartnerType;
}) {
  let domain: string | null = null;
  if (params.website) {
    try {
      domain = new URL(params.website).hostname.replace(/^www\./, "");
    } catch {
      // keep null
    }
  }

  const typeFilter = params.type ? { type: params.type } : {};

  // Build OR clauses only for non-null lookup fields
  const orClauses: object[] = [];
  if (params.marketSourceId) orClauses.push({ marketSourceId: params.marketSourceId });
  if (domain) orClauses.push({ sourceDomain: domain });
  if (params.name) orClauses.push({ name: params.name });

  if (orClauses.length === 0) return null;

  const contact = await prisma.partnerContact.findFirst({
    where: {
      OR: orClauses,
      active: true,
      ...typeFilter,
    },
  });

  return contact;
}

/**
 * Connects a MarketSource to its PartnerContact (DEALER type) if one exists
 * with a matching sourceDomain or name. Used when ingesting listings to establish
 * the link between a listing's source and its known partner contact.
 */
export async function linkMarketSourceToPartnerContact(
  marketSourceId: string,
  marketSourceName: string,
  marketSourceWebsite?: string | null
): Promise<void> {
  let domain: string | null = null;
  if (marketSourceWebsite) {
    try {
      domain = new URL(marketSourceWebsite).hostname.replace(/^www\./, "");
    } catch {
      // keep null
    }
  }

  const orClauses: object[] = [{ name: marketSourceName }];
  if (domain) orClauses.push({ sourceDomain: domain });

  const contact = await prisma.partnerContact.findFirst({
    where: {
      OR: orClauses,
      type: "DEALER",
      active: true,
    },
  });

  if (contact && !contact.marketSourceId) {
    await prisma.partnerContact.update({
      where: { id: contact.id },
      data: {
        marketSourceId,
        contactSource: "IMPORTED_LISTING",
        lastVerifiedAt: new Date(),
      },
    });
  }
}

/**
 * Returns list of partner contacts requiring admin email resolution.
 * Includes linked fulfillment requests so admin can see what's blocked.
 */
export async function getUnresolvedPartnerContacts() {
  return prisma.partnerContact.findMany({
    where: {
      OR: [
        { contactStatus: "UNRESOLVED_EMAIL" },
        { email: null },
      ],
    },
    include: {
      marketSource: true,
      fulfillmentParties: {
        include: {
          fulfillmentRequest: {
            include: {
              depositIntents: true,
              fees: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Resolves an unresolved partner contact with a verified email address.
 * Updates the partner record and automatically dispatches all held DRAFT requests.
 *
 * This is the admin action for resolving the UNRESOLVED_EMAIL hold state.
 */
export async function resolveUnresolvedPartnerContact(
  partnerContactId: string,
  newEmail: string,
  confidence: PartnerConfidence = "MANUAL_REVIEW",
  source: ContactSource = "MANUALLY_VERIFIED"
) {
  if (!isValidEmail(newEmail)) {
    throw new Error(`Invalid email syntax: '${newEmail}'`);
  }

  const cleanEmail = newEmail.trim().toLowerCase();

  // 1. Update Partner Contact record
  const updatedContact = await prisma.partnerContact.update({
    where: { id: partnerContactId },
    data: {
      email: cleanEmail,
      contactStatus: "RESOLVED",
      confidence: confidence === "UNRESOLVED_EMAIL" ? "MANUAL_REVIEW" : confidence,
      contactSource: source,
      lastVerifiedAt: new Date(),
    },
  });

  // 2. Find all linked FulfillmentParties and their held DRAFT requests
  const linkedParties = await prisma.fulfillmentParty.findMany({
    where: { partnerContactId },
    include: {
      fulfillmentRequest: {
        include: {
          partnerTokens: true,
          depositIntents: true,
          vehicle: { include: { model: { include: { make: true } } } },
        },
      },
    },
  });

  let autoDispatchedCount = 0;

  for (const party of linkedParties) {
    const req = party.fulfillmentRequest;
    if (!req || req.status !== "DRAFT") continue;

    // Lazy-load sendFulfillmentEmail to avoid circular dependency
    const { sendFulfillmentEmail } = await import("@/lib/mail/mail-service");

    await prisma.$transaction(async (tx) => {
      // Update party email
      await tx.fulfillmentParty.update({
        where: { id: party.id },
        data: { email: cleanEmail },
      });

      // Update partner decision token email
      for (const token of req.partnerTokens) {
        await tx.partnerDecisionToken.update({
          where: { id: token.id },
          data: { partnerEmail: cleanEmail },
        });
      }

      // Transition request to SENT
      await tx.fulfillmentRequest.update({
        where: { id: req.id },
        data: { status: "SENT" },
      });

      // Audit event
      await tx.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: req.id,
          previousStatus: "DRAFT",
          newStatus: "SENT",
          actorType: "ADMIN",
          note: `Partner email resolved by admin (${cleanEmail}). Held DRAFT request auto-dispatched.`,
        },
      });
    });

    // Dispatch notification email to partner
    const tokenObj = req.partnerTokens[0];
    const vehicleSummary = req.vehicle
      ? `${req.vehicle.year} ${req.vehicle.model.make.name} ${req.vehicle.model.name} (VIN: ${req.vehicle.vin})`
      : "Vehicle Fulfillment Request";

    if (tokenObj) {
      await sendFulfillmentEmail({
        fulfillmentRequestId: req.id,
        templateType:
          req.requestType === "SERVICE_BOOKING"
            ? "SERVICE_BOOKING_REQUEST"
            : req.requestType === "INSURANCE_QUOTE"
            ? "INSURANCE_QUOTE_REQUEST"
            : req.requestType === "TRANSPORT_QUOTE"
            ? "TRANSPORT_REQUEST"
            : "DEALER_PURCHASE_REQUEST",
        recipientName: party.name,
        recipientEmail: cleanEmail,
        packageTitle: `[RESOLVED DISPATCH] Fulfillment Request: ${vehicleSummary}`,
        vehicleSummary,
        reviewUrl: `/fulfillment/${tokenObj.token}`,
        acceptUrl: `/fulfillment/${tokenObj.token}/accept`,
        declineUrl: `/fulfillment/${tokenObj.token}/decline`,
        actorType: "ADMIN",
      });
    }

    autoDispatchedCount++;
  }

  return {
    success: true,
    partnerContact: updatedContact,
    autoDispatchedCount,
    message: `Partner email updated to ${cleanEmail}. ${autoDispatchedCount} held request(s) auto-dispatched.`,
  };
}
