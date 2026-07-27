import React from "react";
import { auth } from "@/auth";
import { getUserFulfillmentTransactions } from "@/lib/fulfillment/service";
import { TransactionCenterClient, TransactionCenterItem } from "@/components/transactions/TransactionCenterClient";

export default async function TransactionsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const rawTransactions = userId ? await getUserFulfillmentTransactions(userId) : [];

  const items: TransactionCenterItem[] = rawTransactions.map((tx) => {
    const isOwnerView = Boolean(
      userId && (tx.vehicle?.ownerId === userId || tx.listing?.sellerId === userId)
    );

    return {
      id: tx.id,
      publicTransactionToken: tx.publicTransactionToken,
      requestType: tx.requestType,
      status: tx.status,
      paymentStatus: tx.paymentStatus,
      expectedPlatformFee: tx.expectedPlatformFee,
      expectedPartnerCommission: tx.expectedPartnerCommission,
      collectedAmount: tx.collectedAmount,
      refundableAmount: tx.refundableAmount,
      payoutStatus: tx.payoutStatus,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      isOwnerView,
      vehicle: tx.vehicle
        ? {
            id: tx.vehicle.id,
            year: tx.vehicle.year,
            make: tx.vehicle.model.make.name,
            model: tx.vehicle.model.name,
            trim: tx.vehicle.trim,
            vin: tx.vehicle.vin,
            image: tx.vehicle.photos[0]?.filePath || null,
          }
        : null,
      parties: tx.parties.map((p) => ({
        id: p.id,
        partyType: p.partyType,
        name: p.name,
        email: p.email,
        companyName: p.companyName,
        roleDescription: p.roleDescription,
      })),
      fees: tx.fees.map((f) => ({
        id: f.id,
        feeType: f.feeType,
        amount: f.amount,
        status: f.status,
      })),
      depositIntents: tx.depositIntents.map((d) => ({
        id: d.id,
        amount: d.amount,
        currency: d.currency,
        status: d.status,
      })),
      events: tx.events.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        newStatus: e.newStatus,
        note: e.note,
      })),
    };
  });

  return <TransactionCenterClient userId={userId} transactions={items} />;
}
