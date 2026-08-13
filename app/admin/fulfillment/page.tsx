import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  ADMIN_FULFILLMENT_PAGE_SIZE,
  type AdminFilterTab,
  getAdminFulfillmentMetrics,
  getAdminFulfillmentRequestCount,
  getAdminFulfillmentRequests,
} from "@/lib/admin/fulfillment-ops";
import { AdminOpsCenterClient, AdminFulfillmentItem } from "@/components/admin/AdminOpsCenterClient";
import { AdminPagination, parseAdminPage } from "@/components/admin/AdminPagination";

const filterTabs = new Set<AdminFilterTab>([
  "ALL",
  "STUCK_EXPIRED",
  "ACCEPTED",
  "DECLINED",
  "PENDING_REFUNDS",
  "FAILED_EMAILS",
]);

export default async function AdminFulfillmentPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[]; tab?: string; type?: string; q?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const requestedPage = parseAdminPage(params?.page);
  const tab = filterTabs.has(params?.tab as AdminFilterTab) ? params?.tab as AdminFilterTab : "ALL";
  const requestType = params?.type?.trim() || undefined;
  const search = params?.q?.trim() || undefined;
  const filters = { requestType, search };

  const [metrics, totalRequests] = await Promise.all([
    getAdminFulfillmentMetrics(),
    getAdminFulfillmentRequestCount(tab, filters),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalRequests / ADMIN_FULFILLMENT_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rawRequests = await getAdminFulfillmentRequests(tab, filters, page);

  const items: AdminFulfillmentItem[] = rawRequests.map((req) => ({
    id: req.id,
    publicTransactionToken: req.publicTransactionToken,
    requestType: req.requestType,
    status: req.status,
    paymentStatus: req.paymentStatus,
    expectedPlatformFee: req.expectedPlatformFee,
    expectedPartnerCommission: req.expectedPartnerCommission,
    collectedAmount: req.collectedAmount,
    payoutStatus: req.payoutStatus,
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
        }
      : null,
    parties: req.parties.map((p) => ({
      id: p.id,
      partyType: p.partyType,
      name: p.name,
      email: p.email,
      companyName: p.companyName,
    })),
    attentionDepositCount: req._count.depositIntents,
    attentionFeeCount: req._count.fees,
    events: req.events.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actorType: e.actorType,
      newStatus: e.newStatus,
      note: e.note,
      metadata: e.metadata,
    })),
  }));

  return (
    <>
      <AdminOpsCenterClient
        metrics={metrics}
        requests={items}
        activeTab={tab}
        searchQuery={search || ""}
        requestTypeFilter={requestType || ""}
      />
      <AdminPagination
        pathname="/admin/fulfillment"
        page={page}
        totalPages={totalPages}
        preserveParams={{ tab, type: requestType, q: search }}
        ariaLabel="Fulfillment request pages"
      />
    </>
  );
}
