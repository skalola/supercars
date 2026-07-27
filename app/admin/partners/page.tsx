import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
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

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      email: c.email,
      phone: c.phone,
      website: c.website,
      sourceDomain: c.sourceDomain,
      makeSpecialization: c.makeSpecialization,
      location: c.location,
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
