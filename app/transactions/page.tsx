import React from "react";
import { auth } from "@/auth";
import {
  getUserFulfillmentSummary,
  getUserFulfillmentTransactionCount,
  getUserFulfillmentTransactions,
  USER_FULFILLMENT_PAGE_SIZE,
  type UserFulfillmentCategory,
} from "@/lib/fulfillment/service";
import { TransactionCenterClient, type TransactionCenterItem } from "@/components/transactions/TransactionCenterClient";
import { AdminPagination, parseAdminPage } from "@/components/admin/AdminPagination";

const transactionCategories = new Set<UserFulfillmentCategory>([
  "ALL",
  "BUYING",
  "SELLING",
  "SERVICE_BOOKINGS",
  "INSURANCE_REQUESTS",
  "TRANSPORT_REQUESTS",
]);

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[]; tab?: string; q?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  const params = await searchParams;
  const requestedPage = parseAdminPage(params?.page);
  const category = transactionCategories.has(params?.tab as UserFulfillmentCategory)
    ? params?.tab as UserFulfillmentCategory
    : "ALL";
  const search = params?.q?.trim() || undefined;
  const filters = { category, search };

  const [summary, searchedTransactionCount] = userId
    ? await Promise.all([
        getUserFulfillmentSummary(userId),
        search
          ? getUserFulfillmentTransactionCount(userId, filters)
          : Promise.resolve(null),
      ])
    : [
        {
          total: 0,
          active: 0,
          attention: 0,
          captured: 0,
          tabCounts: Object.fromEntries([...transactionCategories].map((key) => [key, 0])) as Record<UserFulfillmentCategory, number>,
        },
        null,
      ];
  const totalTransactions = searchedTransactionCount ?? summary.tabCounts[category];
  const totalPages = Math.max(1, Math.ceil(totalTransactions / USER_FULFILLMENT_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rawTransactions = userId ? await getUserFulfillmentTransactions(userId, filters, page) : [];

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

  return (
    <>
      <TransactionCenterClient
        userId={userId}
        transactions={items}
        activeTab={category}
        searchQuery={search || ""}
        summary={summary}
      />
      <AdminPagination
        pathname="/transactions"
        page={page}
        totalPages={totalPages}
        preserveParams={{ tab: category, q: search }}
        ariaLabel="Transaction pages"
      />
    </>
  );
}
