import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { formatCityState, normalizePartnerLocation, normalizePhoneNumber } from "@/lib/directory/partner-contact-format";
import { prisma } from "@/lib/prisma";
import { AdminPartnersClient, AdminPartnerContactItem } from "@/components/admin/AdminPartnersClient";

export default async function AdminPartnersPage() {
  await requireAdmin();

  const allRawContacts = await prisma.partnerContact.findMany({
    include: {
      marketSource: true,
      fulfillmentParties: {
        include: {
          fulfillmentRequest: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const items: AdminPartnerContactItem[] = allRawContacts.map((c) => {
    const heldDraftCount = c.fulfillmentParties.filter(
      (p) => p.fulfillmentRequest && p.fulfillmentRequest.status === "DRAFT"
    ).length;
    const normalizedLocation = normalizePartnerLocation(c);

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      email: c.email,
      phone: normalizePhoneNumber(c.phone),
      website: c.website,
      sourceDomain: c.sourceDomain,
      makeSpecialization: c.makeSpecialization,
      location: normalizedLocation.location || formatCityState(c.city, c.state) || c.location,
      city: normalizedLocation.city,
      state: normalizedLocation.state,
      postalCode: normalizedLocation.postalCode,
      latitude: c.latitude,
      longitude: c.longitude,
      active: c.active,
      contactSource: c.contactSource,
      confidence: c.confidence,
      contactStatus: c.contactStatus,
      lastVerifiedAt: c.lastVerifiedAt,
      marketSource: c.marketSource
        ? {
            id: c.marketSource.id,
            name: c.marketSource.name,
            domain: c.marketSource.website || null,
          }
        : null,
      heldRequestCount: heldDraftCount,
    };
  });

  return <AdminPartnersClient contacts={items} />;
}
