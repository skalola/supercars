import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminFulfillmentMetrics, getAdminFulfillmentRequests } from "@/lib/admin/fulfillment-ops";
import { AdminOpsCenterClient, AdminFulfillmentItem } from "@/components/admin/AdminOpsCenterClient";

export default async function AdminFulfillmentPage() {
  await requireAdmin();

  const [metrics, rawRequests] = await Promise.all([
    getAdminFulfillmentMetrics(),
    getAdminFulfillmentRequests("ALL"),
  ]);

  const items: AdminFulfillmentItem[] = rawRequests.map((req) => ({
    id: req.id,
    publicTransactionToken: req.publicTransactionToken,
    requestType: req.requestType,
    status: req.status,
    paymentStatus: req.paymentStatus,
    expectedPlatformFee: req.expectedPlatformFee,
    expectedPartnerCommission: req.expectedPartnerCommission,
    collectedAmount: req.collectedAmount,
    refundableAmount: req.refundableAmount,
    payoutStatus: req.payoutStatus,
    cancellationReason: req.cancellationReason,
    cancelledByActor: req.cancelledByActor,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
    vehicle: req.vehicle
      ? {
          id: req.vehicle.id,
          year: req.vehicle.year,
          make: req.vehicle.model.make.name,
          model: req.vehicle.model.name,
          trim: req.vehicle.trim,
          vin: req.vehicle.vin,
          image: req.vehicle.photos[0]?.filePath || null,
        }
      : null,
    parties: req.parties.map((p) => ({
      id: p.id,
      partyType: p.partyType,
      name: p.name,
      email: p.email,
      companyName: p.companyName,
    })),
    fees: req.fees.map((f) => ({
      id: f.id,
      feeType: f.feeType,
      amount: f.amount,
      status: f.status,
    })),
    depositIntents: req.depositIntents.map((d) => ({
      id: d.id,
      amount: d.amount,
      currency: d.currency,
      status: d.status,
    })),
    partnerTokens: req.partnerTokens.map((t) => ({
      id: t.id,
      token: t.token,
      partnerName: t.partnerName,
      partnerEmail: t.partnerEmail,
      expiresAt: t.expiresAt,
      actionTaken: t.actionTaken,
    })),
    events: req.events.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actorType: e.actorType,
      newStatus: e.newStatus,
      note: e.note,
      metadata: e.metadata,
    })),
  }));

  return <AdminOpsCenterClient metrics={metrics} requests={items} />;
}
