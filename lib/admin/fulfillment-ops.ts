/**
 * lib/admin/fulfillment-ops.ts
 *
 * Sprint 8.0 Internal Operations Review Layer.
 * Provides admin metrics aggregation, filterable requests retrieval,
 * and admin operational actions (resend email, cancel/refund, mark completed).
 */

import { prisma } from "@/lib/prisma";
import { sendFulfillmentEmail } from "@/lib/mail/mail-service";
import {
  cancelFulfillmentRequest,
  processExpiredFulfillmentRequests,
} from "@/lib/fulfillment/service";
import {
  refundDeposit,
  voidDeposit,
} from "@/lib/payments/payment-service";
import { Prisma } from "@prisma/client";

export interface AdminFulfillmentMetrics {
  totalRequests: number;
  acceptedCount: number;
  declinedCount: number;
  stuckOrExpiredCount: number;
  failedEmailsCount: number;
  pendingRefundsCount: number;
  totalCommissionExpected: number;
  totalCommissionCollected: number;
  /** Sprint 8A: Count of sent/viewed requests awaiting partner decision */
  pendingPartnerResponse: number;
  /** Sprint 8A: Count of requests accepted today (UTC) */
  acceptedToday: number;
  partnerConfidence: {
    verified: number;
    publicSource: number;
    manualReview: number;
    unresolvedEmail: number;
  };
}

export type AdminFilterTab =
  | "ALL"
  | "STUCK_EXPIRED"
  | "ACCEPTED"
  | "DECLINED"
  | "PENDING_REFUNDS"
  | "FAILED_EMAILS";

/**
 * Additional filter options for Admin request list.
 */
export interface AdminFilters {
  /** Request type (e.g., SERVICE_BOOKING, INSURANCE_QUOTE, etc.) */
  requestType?: string;
  /** Specific status to filter (e.g., ACCEPTED, DECLINED, SENT, etc.) */
  status?: string;
  /** Partner identifier – can be partner token, name or email */
  partnerId?: string;
  /** Payment state (AUTHORIZED, CAPTURED, VOIDED, REFUNDED) */
  paymentState?: string;
  /** Stuck/expired flag – true to include only EXPIRED or DRAFT */
  stuckOrExpired?: boolean;
  /** Search request identity, vehicle, or party fields. */
  search?: string;
}

const refundOrSettlementAttentionWhere: Prisma.FulfillmentRequestWhereInput = {
  OR: [
    { payoutStatus: "PENDING_RECONCILIATION" },
    { paymentStatus: { in: ["AUTHORIZATION_PENDING", "AUTHORIZED", "CAPTURE_PENDING", "CAPTURED"] } },
    { depositIntents: { some: { status: { in: ["AUTHORIZED", "HELD", "CAPTURED"] } } } },
    { fees: { some: { status: { in: ["AUTHORIZED", "CAPTURED"] } } } },
  ],
};

export const ADMIN_FULFILLMENT_PAGE_SIZE = 25;

const adminFulfillmentRequestSelect = {
  id: true,
  publicTransactionToken: true,
  requestType: true,
  status: true,
  paymentStatus: true,
  expectedPlatformFee: true,
  expectedPartnerCommission: true,
  collectedAmount: true,
  payoutStatus: true,
  createdAt: true,
  updatedAt: true,
  vehicle: {
    select: {
      id: true,
      year: true,
      trim: true,
      vin: true,
      model: {
        select: {
          name: true,
          make: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
  _count: {
    select: {
      depositIntents: {
        where: { status: { in: ["AUTHORIZED", "HELD", "CAPTURED"] } },
      },
      fees: {
        where: { status: { in: ["AUTHORIZED", "CAPTURED"] } },
      },
    },
  },
} satisfies Prisma.FulfillmentRequestSelect;


/**
 * Calculates operational metrics across all fulfillment requests and partner contacts.
 */
export async function getAdminFulfillmentMetrics(): Promise<AdminFulfillmentMetrics> {
  const [
    totalRequests,
    acceptedCount,
    declinedCount,
    stuckOrExpiredCount,
    failedEvents,
    refundOrSettlementAttentionRequests,
    feeSums,
    partnerContacts,
    pendingPartnerResponses,
    acceptedTodayCount,
  ] = await Promise.all([
    prisma.fulfillmentRequest.count(),
    prisma.fulfillmentRequest.count({ where: { status: "ACCEPTED" } }),
    prisma.fulfillmentRequest.count({ where: { status: "DECLINED" } }),
    prisma.fulfillmentRequest.count({ where: { status: { in: ["EXPIRED", "DRAFT"] } } }),
    prisma.fulfillmentEvent.count({
      where: {
        OR: [
          { note: { contains: "HELD" } },
          { note: { contains: "BLOCKED" } },
          { note: { contains: "UNRESOLVED_EMAIL" } },
        ],
      },
    }),
    prisma.fulfillmentRequest.count({ where: refundOrSettlementAttentionWhere }),
    prisma.fulfillmentRequest.aggregate({
      _sum: {
        expectedPlatformFee: true,
        expectedPartnerCommission: true,
        collectedAmount: true,
      },
    }),
    prisma.partnerContact.groupBy({
      by: ["confidence", "contactStatus"],
      _count: { id: true },
    }),
    prisma.fulfillmentRequest.count({ where: { status: { in: ["SENT", "READY_TO_SEND"] } } }),
    prisma.fulfillmentRequest.count({
      where: {
        status: "ACCEPTED",
        updatedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  ]);

  const totalCommissionExpected =
    Number(feeSums._sum.expectedPlatformFee || 0) +
    Number(feeSums._sum.expectedPartnerCommission || 0);
  const totalCommissionCollected = Number(feeSums._sum.collectedAmount || 0);

  const partnerConfidence = {
    verified: 0,
    publicSource: 0,
    manualReview: 0,
    unresolvedEmail: 0,
  };

  for (const pc of partnerContacts) {
    if (pc.contactStatus === "UNRESOLVED_EMAIL") {
      partnerConfidence.unresolvedEmail += pc._count.id;
    } else {
      switch (pc.confidence) {
        case "VERIFIED":
          partnerConfidence.verified += pc._count.id;
          break;
        case "PUBLIC_SOURCE":
          partnerConfidence.publicSource += pc._count.id;
          break;
        case "MANUAL_REVIEW":
          partnerConfidence.manualReview += pc._count.id;
          break;
      }
    }
  }

  return {
    totalRequests,
    acceptedCount,
    declinedCount,
    stuckOrExpiredCount,
    failedEmailsCount: failedEvents,
    pendingRefundsCount: refundOrSettlementAttentionRequests,
    totalCommissionExpected,
    totalCommissionCollected,
    partnerConfidence,
    pendingPartnerResponse: pendingPartnerResponses,
    acceptedToday: acceptedTodayCount,
  };
}

/**
 * Returns list of fulfillment requests filtered by operational status tab.
 */
function getAdminFulfillmentWhere(
  filter: AdminFilterTab = "ALL",
  options?: AdminFilters
) {
  let whereClause: Prisma.FulfillmentRequestWhereInput = {};

  // Base filter based on tab
  switch (filter) {
    case "STUCK_EXPIRED":
      whereClause = { status: { in: ["EXPIRED", "DRAFT"] } };
      break;
    case "ACCEPTED":
      whereClause = { status: "ACCEPTED" };
      break;
    case "DECLINED":
      whereClause = { status: "DECLINED" };
      break;
    case "PENDING_REFUNDS":
      whereClause = refundOrSettlementAttentionWhere;
      break;
    case "FAILED_EMAILS":
      whereClause = {
        events: {
          some: {
            OR: [
              { note: { contains: "HELD" } },
              { note: { contains: "BLOCKED" } },
              { note: { contains: "UNRESOLVED_EMAIL" } },
            ],
          },
        },
      };
      break;
    case "ALL":
    default:
      whereClause = {};
      break;
  }

  // Apply additional filter options if provided
  if (options) {
    if (options.requestType) {
      whereClause = { ...whereClause, requestType: options.requestType };
    }
    if (options.status) {
      whereClause = { ...whereClause, status: options.status };
    }
    if (options.paymentState) {
      whereClause = { ...whereClause, paymentStatus: options.paymentState };
    }
    if (options.partnerId) {
      // Match against partner token, name or email
      whereClause = {
        AND: [
          whereClause,
          {
            OR: [
              { partnerTokens: { some: { token: options.partnerId } } },
              { parties: { some: { email: options.partnerId } } },
              { parties: { some: { name: options.partnerId } } },
            ],
          },
        ],
      };
    }
    if (options.stuckOrExpired) {
      whereClause = { ...whereClause, status: { in: ["EXPIRED", "DRAFT"] } };
    }
    if (options.search?.trim()) {
      const search = options.search.trim();
      whereClause = {
        AND: [
          whereClause,
          {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { publicTransactionToken: { contains: search, mode: "insensitive" } },
              { vehicle: { vin: { contains: search, mode: "insensitive" } } },
              { vehicle: { model: { name: { contains: search, mode: "insensitive" } } } },
              { vehicle: { model: { make: { name: { contains: search, mode: "insensitive" } } } } },
              { parties: { some: { name: { contains: search, mode: "insensitive" } } } },
              { parties: { some: { email: { contains: search, mode: "insensitive" } } } },
              { parties: { some: { companyName: { contains: search, mode: "insensitive" } } } },
            ],
          },
        ],
      };
    }
  }

  return whereClause;
}

export async function getAdminFulfillmentRequests(
  filter: AdminFilterTab = "ALL",
  options?: AdminFilters,
  page = 1,
) {
  const whereClause = getAdminFulfillmentWhere(filter, options);

  const requests = await prisma.fulfillmentRequest.findMany({
    where: whereClause,
    select: adminFulfillmentRequestSelect,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * ADMIN_FULFILLMENT_PAGE_SIZE,
    take: ADMIN_FULFILLMENT_PAGE_SIZE,
  });

  if (requests.length === 0) return [];

  type LatestEventRow = {
    id: string;
    fulfillmentRequestId: string;
    createdAt: Date;
    actorType: string;
    newStatus: string;
    note: string | null;
    metadata: string | null;
  };
  type SummaryPartyRow = {
    id: string;
    fulfillmentRequestId: string;
    partyType: string;
    name: string;
    email: string | null;
    companyName: string | null;
  };
  const requestIds = requests.map((request) => request.id);
  const [latestEvents, summaryParties] = await Promise.all([
    prisma.$queryRaw<LatestEventRow[]>(Prisma.sql`
      SELECT DISTINCT ON (event."fulfillmentRequestId")
        event."id", event."fulfillmentRequestId", event."createdAt", event."actorType",
        event."newStatus", event."note", event."metadata"
      FROM "FulfillmentEvent" event
      WHERE event."fulfillmentRequestId" IN (${Prisma.join(requestIds)})
      ORDER BY event."fulfillmentRequestId", event."createdAt" DESC
    `),
    prisma.$queryRaw<SummaryPartyRow[]>(Prisma.sql`
      WITH ranked_parties AS (
        SELECT party."id", party."fulfillmentRequestId", party."partyType", party."name",
          party."email", party."companyName",
          ROW_NUMBER() OVER (
            PARTITION BY party."fulfillmentRequestId",
              CASE
                WHEN party."partyType" = 'BUYER' THEN 'BUYER'
                WHEN party."partyType" NOT IN ('SELLER', 'PLATFORM') THEN 'PARTNER'
                ELSE party."partyType"
              END
            ORDER BY party."createdAt" ASC
          ) AS party_rank
        FROM "FulfillmentParty" party
        WHERE party."fulfillmentRequestId" IN (${Prisma.join(requestIds)})
          AND (party."partyType" = 'BUYER' OR party."partyType" NOT IN ('SELLER', 'PLATFORM'))
      )
      SELECT "id", "fulfillmentRequestId", "partyType", "name", "email", "companyName"
      FROM ranked_parties
      WHERE party_rank = 1
      ORDER BY "fulfillmentRequestId", "partyType"
    `),
  ]);
  const eventByRequestId = new Map(latestEvents.map((event) => [event.fulfillmentRequestId, event]));
  const partiesByRequestId = new Map<string, SummaryPartyRow[]>();
  for (const party of summaryParties) {
    const parties = partiesByRequestId.get(party.fulfillmentRequestId) ?? [];
    parties.push(party);
    partiesByRequestId.set(party.fulfillmentRequestId, parties);
  }

  return requests.map((request) => ({
    ...request,
    expectedPlatformFee: Number(request.expectedPlatformFee),
    expectedPartnerCommission: Number(request.expectedPartnerCommission),
    collectedAmount: Number(request.collectedAmount),
    events: eventByRequestId.has(request.id) ? [eventByRequestId.get(request.id)!] : [],
    parties: partiesByRequestId.get(request.id) ?? [],
  }));
}

export function getAdminFulfillmentRequestCount(
  filter: AdminFilterTab = "ALL",
  options?: AdminFilters,
) {
  return prisma.fulfillmentRequest.count({
    where: getAdminFulfillmentWhere(filter, options),
  });
}

/**
 * Admin Action: Resends email notification to partner or buyer.
 */
export async function resendFulfillmentEmailAdmin(requestId: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      publicTransactionToken: true,
      requestType: true,
      status: true,
      parties: {
        select: {
          partyType: true,
          name: true,
          email: true,
        },
      },
      partnerTokens: {
        where: {
          actionTaken: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        select: {
          token: true,
          partnerName: true,
          partnerEmail: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      vehicle: {
        select: {
          year: true,
          vin: true,
          model: {
            select: {
              name: true,
              make: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!req) {
    throw new Error(`FulfillmentRequest not found: ${requestId}`);
  }

  const partnerToken = req.partnerTokens[0];
  const partnerParty = req.parties.find((p) => p.partyType !== "BUYER" && p.partyType !== "SELLER" && p.partyType !== "PLATFORM");
  const buyerParty = req.parties.find((p) => p.partyType === "BUYER");
  const partnerRecipient = partnerParty || (partnerToken?.partnerEmail
    ? {
        name: partnerToken.partnerName || "Fulfillment Partner",
        email: partnerToken.partnerEmail,
      }
    : null);

  const vehicleSummary = req.vehicle
    ? `${req.vehicle.year} ${req.vehicle.model.make.name} ${req.vehicle.model.name} (VIN: ${req.vehicle.vin})`
    : "Fulfillment Request";

  let resultMessage = "";

  if (partnerRecipient && partnerRecipient.email && partnerToken) {
    const res = await sendFulfillmentEmail({
      fulfillmentRequestId: req.id,
      templateType: req.requestType === "SERVICE_BOOKING"
        ? "SERVICE_BOOKING_REQUEST"
        : req.requestType === "INSURANCE_QUOTE"
        ? "INSURANCE_QUOTE_REQUEST"
        : req.requestType === "TRANSPORT_QUOTE"
        ? "TRANSPORT_REQUEST"
        : "DEALER_PURCHASE_REQUEST",
      recipientName: partnerRecipient.name,
      recipientEmail: partnerRecipient.email,
      packageTitle: `[ADMIN RESEND] Fulfillment Request: ${vehicleSummary}`,
      vehicleSummary,
      reviewUrl: `/fulfillment/${partnerToken.token}`,
      acceptUrl: `/fulfillment/${partnerToken.token}/accept`,
      declineUrl: `/fulfillment/${partnerToken.token}/decline`,
      actorType: "ADMIN",
      dispatchMode: "RESENT",
    });
    resultMessage = res.message;
  } else if (buyerParty && buyerParty.email) {
    const res = await sendFulfillmentEmail({
      fulfillmentRequestId: req.id,
      templateType: "BUYER_CONFIRMATION",
      recipientName: buyerParty.name,
      recipientEmail: buyerParty.email,
      packageTitle: `[ADMIN RESEND] Order Confirmation: ${vehicleSummary}`,
      vehicleSummary,
      reviewUrl: `/transactions/${req.publicTransactionToken}`,
      actorType: "ADMIN",
      dispatchMode: "RESENT",
    });
    resultMessage = res.message;
  } else {
    resultMessage = "No valid partner or buyer email found to resend notification.";
  }

  // Audit event
  await prisma.fulfillmentEvent.create({
    data: {
      fulfillmentRequestId: req.id,
      previousStatus: req.status,
      newStatus: req.status,
      actorType: "ADMIN",
      note: `Admin re-dispatched notification email. Result: ${resultMessage}`,
    },
  });

  return { success: true, message: resultMessage };
}

/**
 * Admin Action: Executes admin cancellation and refund.
 */
export async function adminCancelAndRefund(requestId: string, reason: string) {
  return await cancelFulfillmentRequest({
    fulfillmentRequestId: requestId,
    cancelledByActor: "ADMIN",
    cancellationReason: reason || "Administrative cancellation and refund.",
  });
}

/**
 * Admin Action: Processes ignored partner decision links whose TTL has elapsed.
 * Uses the shared fulfillment lifecycle so deposits are released before status
 * is finalized and all request-level audit events remain consistent.
 */
export async function adminProcessExpiredPartnerRequests() {
  const result = await processExpiredFulfillmentRequests();
  return {
    success: true,
    processedCount: result.processedCount,
    message:
      result.processedCount === 1
        ? "Processed 1 expired partner request and released any open authorization hold."
        : `Processed ${result.processedCount} expired partner requests and released any open authorization holds.`,
  };
}

/**
 * Admin Action: Manually marks a fulfillment request as COMPLETED.
 */
export async function adminMarkCompleted(requestId: string, note?: string) {
  await prisma.$transaction(async (tx) => {
    const update = await tx.fulfillmentRequest.updateMany({
      where: { id: requestId, status: "ACCEPTED" },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        payoutStatus: "RECONCILED",
      },
    });

    if (update.count !== 1) {
      const current = await tx.fulfillmentRequest.findUnique({
        where: { id: requestId },
        select: { status: true },
      });
      if (!current) throw new Error(`FulfillmentRequest not found: ${requestId}`);
      throw new Error(`Only ACCEPTED fulfillment requests can be marked completed. Current status: ${current.status}`);
    }

    await tx.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: requestId,
        previousStatus: "ACCEPTED",
        newStatus: "COMPLETED",
        actorType: "ADMIN",
        note: note || "Admin marked fulfillment request completed manually. Financial payout reconciled.",
      },
    });
  });

  return {
    success: true,
    message: "Fulfillment request successfully marked COMPLETED by admin.",
  };
}

/**
 * Admin Action: Release held deposits and refund fees for a request (post‑acceptance).
 * This does NOT change the request status; it merely releases financial holds.
 */
export async function adminReleaseRefund(requestId: string, note?: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      payoutStatus: true,
      collectedAmount: true,
      depositIntents: {
        select: {
          id: true,
          amount: true,
          status: true,
          transactionRef: true,
        },
      },
      fees: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!req) {
    throw new Error(`FulfillmentRequest not found: ${requestId}`);
  }

  const releasableDeposits = req.depositIntents.filter((deposit) =>
    ["AUTHORIZED", "HELD"].includes(deposit.status)
  );
  const refundableDeposits = req.depositIntents.filter((deposit) => deposit.status === "CAPTURED");

  try {
    for (const deposit of releasableDeposits) {
      await voidDeposit(deposit.transactionRef || "");
    }

    for (const deposit of refundableDeposits) {
      await refundDeposit(deposit.transactionRef || "", Number(deposit.amount));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment provider settlement failed.";
    await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus: req.status,
        newStatus: req.status,
        actorType: "ADMIN",
        note: `Admin release/refund blocked before request mutation: ${message}`,
      },
    });
    return {
      success: false,
      message: `Release/refund blocked because payment settlement failed: ${message}`,
    };
  }

  const releasedAmount = releasableDeposits.reduce((sum, deposit) => sum + Number(deposit.amount), 0);
  const refundedAmount = refundableDeposits.reduce((sum, deposit) => sum + Number(deposit.amount), 0);

  await prisma.$transaction(async (tx) => {
    for (const deposit of releasableDeposits) {
      await tx.depositIntent.update({
        where: { id: deposit.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    }

    for (const deposit of refundableDeposits) {
      await tx.depositIntent.update({
        where: { id: deposit.id },
        data: { status: "REFUNDED", releasedAt: new Date() },
      });
    }

    for (const fee of req.fees) {
      if (["AUTHORIZED", "ESTIMATED", "CAPTURED"].includes(fee.status)) {
        await tx.fulfillmentFee.update({
          where: { id: fee.id },
          data: { status: "REFUNDED" },
        });
      }
    }

    const paymentStatus =
      refundedAmount > 0 ? "REFUNDED" : releasedAmount > 0 ? "VOIDED" : req.paymentStatus;
    const payoutStatus =
      ["CANCELLED", "DECLINED", "EXPIRED"].includes(req.status) ? "RECONCILED" : req.payoutStatus;

    await tx.fulfillmentRequest.update({
      where: { id: req.id },
      data: {
        paymentStatus,
        refundableAmount: 0,
        payoutStatus,
        collectedAmount: refundedAmount > 0 ? 0 : req.collectedAmount,
      },
    });

    await tx.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus: req.status,
        newStatus: req.status,
        actorType: "ADMIN",
        note:
          note ||
          `Admin released/refunded financial holds. Released $${releasedAmount}; refunded $${refundedAmount}.`,
      },
    });
  });

  return {
    success: true,
    message:
      refundedAmount > 0
        ? `Refunded $${refundedAmount} and reconciled outstanding financial state.`
        : releasedAmount > 0
        ? `Released $${releasedAmount} in authorization holds and reconciled outstanding financial state.`
        : "No releasable or refundable payment holds were found.",
  };
}

/**
 * Admin Action: Permanently deletes a fulfillment transaction row and all
 * dependent fulfillment records. Use for cleanup of test, duplicate, or
 * invalid transactions after any required payment cancellation/refund is done.
 */
export async function adminDeleteFulfillmentRequest(requestId: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      paymentStatus: true,
      status: true,
      collectedAmount: true,
      refundableAmount: true,
      depositIntents: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!req) {
    throw new Error(`FulfillmentRequest not found: ${requestId}`);
  }

  const hasOpenMoneyState =
    Number(req.collectedAmount) > 0 ||
    Number(req.refundableAmount) > 0 ||
    ["AUTHORIZED", "CAPTURE_PENDING", "CAPTURED"].includes(req.paymentStatus) ||
    req.depositIntents.some((deposit) => ["AUTHORIZED", "HELD", "CAPTURED"].includes(deposit.status));

  if (hasOpenMoneyState && !["REFUNDED", "VOIDED", "CANCELLED", "NOT_REQUIRED"].includes(req.paymentStatus)) {
    throw new Error("Cancel/refund or release/refund this transaction before deleting it.");
  }

  await prisma.fulfillmentRequest.delete({
    where: { id: requestId },
  });

  return {
    success: true,
    message: "Fulfillment transaction permanently deleted.",
  };
}
