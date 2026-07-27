/**
 * lib/fulfillment/service.ts
 *
 * Core service layer for Sprint 7.0 Fulfillment Infrastructure.
 * Manages fulfillment requests, tokenized partner access, audit events,
 * scoped package data isolation, and deposit authorization hold/capture logic.
 */

import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { isValidEmail, resolvePartnerContact } from "./partner-registry";
import { sendFulfillmentEmail } from "@/lib/mail/mail-service";
import {
  authorizeDeposit,
  captureDeposit,
  refundDeposit,
  voidDeposit,
} from "@/lib/payments/payment-service";
import type {
  CreateFulfillmentRequestInput,
  FulfillmentActorType,
  FulfillmentFeeType,
  FulfillmentPartyType,
  FulfillmentRequestType,
  FulfillmentStatus,
  PartnerDecisionInput,
} from "./types";

const TERMINAL_FULFILLMENT_STATUSES = new Set([
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
  "COMPLETED",
]);

function getDefaultPartnerTtlDays(requestType: FulfillmentRequestType): number {
  switch (requestType) {
    case "TRANSPORT_QUOTE":
    case "SERVICE_BOOKING":
      return 3;
    default:
      return 7;
  }
}

function isPartnerPartyType(partyType: string): boolean {
  return [
    "DEALER",
    "INSURANCE_CARRIER",
    "TRANSPORT_PROVIDER",
    "SERVICE_CENTER",
  ].includes(partyType);
}

function getPartnerTypeForRequest(requestType: FulfillmentRequestType) {
  switch (requestType) {
    case "DEALER_PURCHASE":
      return "DEALER";
    case "INSURANCE_QUOTE":
      return "INSURER";
    case "TRANSPORT_QUOTE":
      return "TRANSPORTER";
    case "SERVICE_BOOKING":
      return "SERVICE_SHOP";
  }
}

/**
 * Creates a standardized Fulfillment Request with parties, scoped package,
 * fees, deposit intent, partner decision token, and initial audit event.
 * Enforces NO GUESSED EMAILS rule.
 */
export async function createFulfillmentRequest(input: CreateFulfillmentRequestInput) {
  const publicTransactionToken = crypto.randomUUID();
  const partnerToken = crypto.randomUUID();

  // Validate partner email: block dispatch if email is missing or unresolved syntax
  const partnerEmailValid = isValidEmail(input.partnerEmail);
  const partnerEmail = partnerEmailValid ? input.partnerEmail!.trim().toLowerCase() : null;

  // If partner email is unresolved/missing, set initial status to DRAFT to prevent dispatching to guessed emails
  let initialStatus: FulfillmentStatus = input.status || "SENT";
  if (!partnerEmailValid && initialStatus === "SENT") {
    initialStatus = "DRAFT";
  }

  // Determine token TTL based on request type if not explicitly provided.
  const expiresAt = input.partnerExpiresInDays
    ? new Date(Date.now() + input.partnerExpiresInDays * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + getDefaultPartnerTtlDays(input.requestType) * 24 * 60 * 60 * 1000);

  // Resolve partner contact from registry — uses marketSourceId (strongest), then domain, then name
  // Type filter prevents cross-type collisions (e.g., a dealer named "Hagerty" matching an insurer)
  const resolvedPartner = await resolvePartnerContact({
    name: input.partnerName || undefined,
    marketSourceId: input.partnerMarketSourceId || undefined,
    type: input.partnerType || undefined,
  });

  const expectedPlatformFee =
    input.fees?.filter((f) => f.feeType === "COMMISSION").reduce((acc, f) => acc + f.amount, 0) || 0;
  const expectedPartnerCommission =
    input.fees?.filter((f) => f.feeType === "REFERRAL_FEE").reduce((acc, f) => acc + f.amount, 0) || 0;
  const refundableAmount = input.depositIntent?.amount || 0;
  const initialPaymentStatus = input.depositIntent ? "AUTHORIZED" : "NOT_REQUIRED";
  const authorizedDeposit = input.depositIntent
    ? await authorizeDeposit({
        amount: input.depositIntent.amount,
        currency: input.depositIntent.currency,
        paymentMethod: input.depositIntent.paymentMethod,
        publicTransactionToken,
      })
    : null;

  const fulfillmentRequest = await prisma.fulfillmentRequest.create({
    data: {
      requestType: input.requestType,
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
      publicTransactionToken,
      expectedPlatformFee,
      expectedPartnerCommission,
      collectedAmount: 0,
      refundableAmount,
      payoutStatus: "UNSETTLED",
      buyerId: input.buyerId || null,
      vehicleId: input.vehicleId || null,
      listingId: input.listingId || null,
      purchaseId: input.purchaseId || null,
      notes: input.notes || null,

      // Initial Parties
      parties: input.parties?.length
        ? {
            create: input.parties.map((p) => ({
              partyType: p.partyType,
              name: p.name,
              email: isValidEmail(p.email) ? p.email!.trim().toLowerCase() : null,
              phone: p.phone || null,
              companyName: p.companyName || null,
              address: p.address || null,
              roleDescription: p.roleDescription || null,
              userId: p.userId || null,
              partnerContactId: resolvedPartner && isPartnerPartyType(p.partyType) ? resolvedPartner.id : null,
            })),
          }
        : undefined,

      // Scoped Data Package
      packages: {
        create: {
          title: input.packageTitle,
          description: input.packageDescription || null,
          scope: JSON.stringify(input.scopedPackageData),
        },
      },

      // Fees
      fees: input.fees?.length
        ? {
            create: input.fees.map((f) => ({
              feeType: f.feeType,
              amount: f.amount,
              currency: f.currency || "USD",
              status: f.status || "ESTIMATED",
              description: f.description || null,
            })),
          }
        : undefined,

      // Deposit Intent (Authorization Hold — money NOT captured until accepted)
      depositIntents: input.depositIntent
        ? {
            create: {
              amount: input.depositIntent.amount,
              currency: input.depositIntent.currency || "USD",
              status: "AUTHORIZED",
              paymentMethod: input.depositIntent.paymentMethod || "CREDIT_CARD_HOLD",
              transactionRef: authorizedDeposit?.transactionRef || input.depositIntent.transactionRef || `ledger:auth_${crypto.randomUUID()}`,
              expiresAt: input.depositIntent.expiresAt || expiresAt,
            },
          }
        : undefined,

      // Partner Decision Token
      partnerTokens: {
        create: {
          token: partnerToken,
          partnerName: input.partnerName || null,
          partnerEmail,
          expiresAt,
        },
      },

      // Initial Audit Event
      events: {
        create: {
          previousStatus: null,
          newStatus: initialStatus,
          actorType: "SYSTEM",
          note: partnerEmailValid
            ? `Fulfillment request initialized (${input.requestType})${authorizedDeposit ? `; deposit authorization created via ${authorizedDeposit.provider}.` : ""}`
            : `Fulfillment request held as DRAFT — Partner email unresolved. Dispatch blocked to avoid guessed emails.${authorizedDeposit ? ` Deposit authorization created via ${authorizedDeposit.provider}.` : ""}`,
        },
      },
    },
    include: {
      parties: true,
      packages: true,
      fees: true,
      depositIntents: true,
      partnerTokens: true,
      events: true,
      vehicle: {
        include: {
          model: { include: { make: true } },
        },
      },
    },
  });

  // Dispatch Buyer Confirmation Email if buyer email is available
  const buyerParty = fulfillmentRequest.parties.find((p) => p.partyType === "BUYER");
  if (buyerParty && buyerParty.email) {
    const vehicleSummary = fulfillmentRequest.vehicle
      ? `${fulfillmentRequest.vehicle.year} ${fulfillmentRequest.vehicle.model.make.name} ${fulfillmentRequest.vehicle.model.name} (VIN: ${fulfillmentRequest.vehicle.vin})`
      : "Vehicle Fulfillment Request";

    await sendFulfillmentEmail({
      fulfillmentRequestId: fulfillmentRequest.id,
      templateType: "BUYER_CONFIRMATION",
      recipientName: buyerParty.name,
      recipientEmail: buyerParty.email,
      packageTitle: input.packageTitle,
      vehicleSummary,
      priceOrAmount: input.fees?.[0]?.amount,
      reviewUrl: `/transactions/${fulfillmentRequest.publicTransactionToken}`,
    });
  }

  return fulfillmentRequest;
}

/**
 * Retrieves a fulfillment request for a partner using their secure decision token.
 * Partner does NOT need an account.
 * Automatically records a VIEWED event on first access.
 */
export async function getPartnerFulfillmentPackage(token: string) {
  const tokenRecord = await prisma.partnerDecisionToken.findUnique({
    where: { token },
    include: {
      fulfillmentRequest: {
        include: {
          packages: true,
          vehicle: {
            include: {
              model: { include: { make: true } },
              photos: { take: 1 },
            },
          },
          fees: true,
          depositIntents: true,
          parties: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    return { error: "INVALID_TOKEN", message: "Token not found or invalid." };
  }

  if (!tokenRecord.actionTaken && tokenRecord.expiresAt && new Date() > tokenRecord.expiresAt) {
    await expirePartnerDecisionToken(tokenRecord.id);
    return { error: "TOKEN_EXPIRED", message: "This fulfillment link has expired." };
  }

  const req = tokenRecord.fulfillmentRequest;

  // Auto-transition to VIEWED on first access if currently SENT or READY_TO_SEND
  if (req.status === "SENT" || req.status === "READY_TO_SEND") {
    await prisma.$transaction([
      prisma.fulfillmentRequest.update({
        where: { id: req.id },
        data: { status: "VIEWED" },
      }),
      prisma.partnerDecisionToken.update({
        where: { id: tokenRecord.id },
        data: { viewedAt: tokenRecord.viewedAt || new Date() },
      }),
      prisma.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: req.id,
          previousStatus: req.status,
          newStatus: "VIEWED",
          actorType: "PARTNER",
          actorId: tokenRecord.partnerName || "PARTNER",
          note: "Partner accessed tokenized package portal",
        },
      }),
    ]);
    req.status = "VIEWED";
  }

  // Parse scoped package data safely
  const primaryPackage = req.packages[0];
  let parsedScope: Record<string, unknown> = {};
  if (primaryPackage?.scope) {
    try {
      parsedScope = JSON.parse(primaryPackage.scope);
    } catch {
      parsedScope = { raw: primaryPackage.scope };
    }
  }

  // Scoped response: partners see only the authorized package, vehicle context,
  // current workflow status, and deposit hold state needed to make a decision.
  // Internal platform settlement, payout, fee, party, and customer transaction
  // fields stay out of tokenized partner URLs.
  return {
    success: true,
    token: tokenRecord.token,
    actionTaken: tokenRecord.actionTaken,
    actionTakenAt: tokenRecord.actionTakenAt,
    expiresAt: tokenRecord.expiresAt,
    request: {
      id: req.id,
      requestType: req.requestType,
      status: req.status,
      paymentStatus: req.paymentStatus,
      createdAt: req.createdAt,
      package: {
        title: primaryPackage?.title || "Fulfillment Package",
        description: primaryPackage?.description,
        scopedData: sanitizePartnerScopedData(parsedScope) as Record<string, unknown>,
      },
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
      depositHold: req.depositIntents[0]
        ? {
            amount: req.depositIntents[0].amount,
            currency: req.depositIntents[0].currency,
            status: req.depositIntents[0].status,
          }
        : null,
    },
  };
}

const partnerScopedDenylist = new Set([
  "decisionTokenUrl",
  "acceptUrl",
  "declineUrl",
  "platformFee",
  "platformCommission",
  "expectedPlatformFee",
  "expectedPartnerCommission",
  "collectedAmount",
  "refundableAmount",
  "payoutStatus",
  "paymentStatus",
  "internalNotes",
  "adminNotes",
]);

function sanitizePartnerScopedData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizePartnerScopedData);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !partnerScopedDenylist.has(key))
        .map(([key, nested]) => [key, sanitizePartnerScopedData(nested)])
    );
  }

  return value;
}

/**
 * Retrieves a fulfillment request for a buyer/owner using their transaction token.
 * Shows complete transaction status, active parties, deposit holds, and event audit log.
 */
export async function getBuyerFulfillmentTransaction(publicToken: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { publicTransactionToken: publicToken },
    include: {
      parties: true,
      packages: true,
      events: { orderBy: { createdAt: "asc" } },
      fees: true,
      depositIntents: true,
      vehicle: {
        include: {
          model: { include: { make: true } },
          photos: { take: 1 },
        },
      },
    },
  });

  if (!req) {
    return { error: "NOT_FOUND", message: "Transaction not found." };
  }

  return {
    success: true,
    request: req,
  };
}

/**
 * Handles a partner's decision (ACCEPT or DECLINE) via their tokenized link.
 * Updates request status, logs audit event, and enforces payment hold rules.
 */
export async function submitPartnerDecision(input: PartnerDecisionInput) {
  const tokenRecord = await prisma.partnerDecisionToken.findUnique({
    where: { token: input.token },
    include: {
      fulfillmentRequest: {
        include: {
          depositIntents: true,
          fees: true,
          parties: true,
          vehicle: {
            include: {
              model: { include: { make: true } },
            },
          },
        },
      },
    },
  });

  if (!tokenRecord) {
    return { error: "INVALID_TOKEN", message: "Token not found or invalid." };
  }

  if (tokenRecord.actionTaken) {
    return {
      error: "ACTION_ALREADY_TAKEN",
      message: `Decision already submitted as ${tokenRecord.actionTaken}.`,
    };
  }

  if (tokenRecord.expiresAt && new Date() > tokenRecord.expiresAt) {
    await expirePartnerDecisionToken(tokenRecord.id);
    return { error: "TOKEN_EXPIRED", message: "This decision link has expired." };
  }

  const req = tokenRecord.fulfillmentRequest;
  if (TERMINAL_FULFILLMENT_STATUSES.has(req.status)) {
    return {
      error: "REQUEST_ALREADY_FINALIZED",
      message: `Request is already finalized as ${req.status}.`,
    };
  }

  const previousStatus = req.status;
  const newStatus: FulfillmentStatus = input.decision === "ACCEPTED" ? "ACCEPTED" : "DECLINED";
  const eligibleDeposits = req.depositIntents.filter((deposit) => deposit.status === "AUTHORIZED" || deposit.status === "HELD");
  let totalCaptured = 0;

  try {
    if (input.decision === "ACCEPTED") {
      for (const deposit of eligibleDeposits) {
        await captureDeposit(deposit.transactionRef || "", deposit.amount);
        totalCaptured += deposit.amount;
      }
    } else {
      for (const deposit of eligibleDeposits) {
        await voidDeposit(deposit.transactionRef || "");
      }
    }
  } catch (error) {
    const operation = input.decision === "ACCEPTED" ? "capture" : "void";
    const message = error instanceof Error ? error.message : `Payment ${operation} failed.`;
    await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus,
        newStatus: previousStatus,
        actorType: "SYSTEM",
        note: `Payment ${operation} failed before partner decision finalization: ${message}`,
      },
    });
    return {
      error: input.decision === "ACCEPTED" ? "PAYMENT_CAPTURE_FAILED" : "PAYMENT_VOID_FAILED",
      message,
    };
  }

  await prisma.$transaction(async (tx) => {
    // Update token decision
    await tx.partnerDecisionToken.update({
      where: { id: tokenRecord.id },
      data: {
        actionTaken: input.decision,
        actionTakenAt: new Date(),
      },
    });

    // Update fulfillment request status
    await tx.fulfillmentRequest.update({
      where: { id: req.id },
      data: { status: newStatus },
    });

    // Log immutable audit event
    await tx.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus,
        newStatus,
        actorType: "PARTNER",
        actorId: tokenRecord.partnerName || "PARTNER",
        note: input.note || `Partner submitted decision: ${input.decision}`,
        metadata: JSON.stringify({
          decision: input.decision,
          tokenId: tokenRecord.id,
          partnerName: tokenRecord.partnerName || null,
          partnerEmail: tokenRecord.partnerEmail || null,
          tokenViewedAt: tokenRecord.viewedAt?.toISOString() || null,
          tokenExpiresAt: tokenRecord.expiresAt?.toISOString() || null,
          auditContext: sanitizePartnerDecisionAuditContext(input.auditContext),
        }),
      },
    });

    // Handle Payment Hold / DepositIntent capture/release rules
    if (input.decision === "ACCEPTED") {
      for (const deposit of req.depositIntents) {
        if (deposit.status === "AUTHORIZED" || deposit.status === "HELD") {
          await tx.depositIntent.update({
            where: { id: deposit.id },
            data: {
              status: "CAPTURED",
              capturedAt: new Date(),
            },
          });
        }
      }
      const shouldCaptureFeesOnAccept = req.requestType !== "INSURANCE_QUOTE";
      for (const fee of req.fees) {
        if (shouldCaptureFeesOnAccept && (fee.status === "AUTHORIZED" || fee.status === "ESTIMATED")) {
          await tx.fulfillmentFee.update({
            where: { id: fee.id },
            data: { status: "CAPTURED" },
          });
        }
      }

      const paymentStatus = req.requestType === "INSURANCE_QUOTE"
        ? req.paymentStatus
        : "CAPTURED";

      await tx.fulfillmentRequest.update({
        where: { id: req.id },
        data: {
          status: newStatus,
          paymentStatus,
          partnerAcceptedAt: new Date(),
          collectedAmount: totalCaptured || req.collectedAmount,
          payoutStatus: req.requestType === "INSURANCE_QUOTE" ? "UNSETTLED" : "PENDING_RECONCILIATION",
        },
      });
    } else if (input.decision === "DECLINED") {
      // Release deposit hold immediately if declined
      for (const deposit of req.depositIntents) {
        if (deposit.status === "AUTHORIZED" || deposit.status === "HELD") {
          await tx.depositIntent.update({
            where: { id: deposit.id },
            data: {
              status: "RELEASED",
              releasedAt: new Date(),
            },
          });
        }
      }
      for (const fee of req.fees) {
        if (fee.status === "AUTHORIZED" || fee.status === "ESTIMATED") {
          await tx.fulfillmentFee.update({
            where: { id: fee.id },
            data: { status: "REFUNDED" },
          });
        }
      }

      await tx.fulfillmentRequest.update({
        where: { id: req.id },
        data: {
          status: newStatus,
          paymentStatus: "VOIDED",
          refundableAmount: 0,
          payoutStatus: "UNSETTLED",
        },
      });
    }
  });

  // Dispatch notification email to buyer party
  const buyerParty = req.parties.find((p) => p.partyType === "BUYER");
  if (buyerParty && buyerParty.email) {
    const vehicleSummary = req.vehicle
      ? `${req.vehicle.year} ${req.vehicle.model.make.name} ${req.vehicle.model.name} (VIN: ${req.vehicle.vin})`
      : "Vehicle Fulfillment Request";

    await sendFulfillmentEmail({
      fulfillmentRequestId: req.id,
      templateType: input.decision === "ACCEPTED" ? "ACCEPTED_NOTIFICATION" : "DECLINED_NOTIFICATION",
      recipientName: buyerParty.name,
      recipientEmail: buyerParty.email,
      packageTitle: `Request ${input.decision.toLowerCase()} by partner '${tokenRecord.partnerName || "Partner"}'`,
      vehicleSummary,
      reviewUrl: `/transactions/${req.publicTransactionToken}`,
    });
  }

  return {
    success: true,
    newStatus,
    message: `Fulfillment request successfully ${newStatus.toLowerCase()}.`,
  };
}

function sanitizePartnerDecisionAuditContext(
  auditContext: PartnerDecisionInput["auditContext"]
) {
  if (!auditContext) return null;

  return {
    requestMethod: truncateAuditValue(auditContext.requestMethod, 16),
    routePath: truncateAuditValue(auditContext.routePath, 240),
    ipAddress: truncateAuditValue(auditContext.ipAddress, 80),
    userAgent: truncateAuditValue(auditContext.userAgent, 400),
    referer: truncateAuditValue(auditContext.referer, 400),
    contentType: truncateAuditValue(auditContext.contentType, 160),
    submittedVia: auditContext.submittedVia || "SERVICE",
  };
}

function truncateAuditValue(value: string | undefined, maxLength: number) {
  if (!value) return null;
  return value.slice(0, maxLength);
}

/**
 * Updates status of a fulfillment request and appends an immutable audit event log.
 */
export async function updateFulfillmentStatus(
  requestId: string,
  newStatus: FulfillmentStatus,
  actorType: "BUYER" | "PARTNER" | "SYSTEM" | "ADMIN" = "SYSTEM",
  actorId?: string,
  note?: string
) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: requestId },
  });

  if (!req) {
    throw new Error(`FulfillmentRequest not found: ${requestId}`);
  }

  const previousStatus = req.status;

  const updated = await prisma.$transaction([
    prisma.fulfillmentRequest.update({
      where: { id: requestId },
      data: { status: newStatus },
    }),
    prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: requestId,
        previousStatus,
        newStatus,
        actorType,
        actorId: actorId || null,
        note: note || `Status updated to ${newStatus}`,
      },
    }),
  ]);

  return updated[0];
}

// ──────────────────────────────────────────────
// Sprint 7.1: Permission Scoping & User Views
// ──────────────────────────────────────────────

/**
 * Returns user profile transaction list for authenticated buyers / owners / sellers.
 */
export async function getUserFulfillmentTransactions(userId: string) {
  const requests = await prisma.fulfillmentRequest.findMany({
    where: {
      OR: [
        { buyerId: userId },
        { parties: { some: { userId } } },
        { vehicle: { ownerId: userId } },
        { listing: { sellerId: userId } },
      ],
    },
    include: {
      vehicle: {
        include: {
          model: { include: { make: true } },
          photos: { take: 1 },
        },
      },
      listing: { select: { sellerId: true } },
      parties: true,
      fees: true,
      depositIntents: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return requests;
}

/**
 * Returns role-scoped view for /transactions/[id] or /transactions/[publicToken].
 * Roles:
 * - BUYER: sees buyer info, vehicle specs, package status, fees, deposit hold, and next steps timeline.
 * - SELLER / OWNER: sees vehicle specs, buyer request summary, and transaction status (excludes buyer profile history and partner decision tokens).
 */
export async function getFulfillmentByIdForUser(idOrToken: string, userId?: string) {
  const req = await prisma.fulfillmentRequest.findFirst({
    where: {
      OR: [{ id: idOrToken }, { publicTransactionToken: idOrToken }],
    },
    include: {
      parties: true,
      packages: true,
      events: { orderBy: { createdAt: "asc" } },
      fees: true,
      depositIntents: true,
      vehicle: {
        include: {
          model: { include: { make: true } },
          photos: { take: 1 },
          owner: { select: { id: true, name: true, email: true } },
        },
      },
      listing: {
        select: { id: true, sellerId: true, askingPrice: true },
      },
    },
  });

  if (!req) {
    return { error: "NOT_FOUND", message: "Transaction record not found." };
  }

  if (!userId) {
    return { error: "UNAUTHORIZED", message: "Please sign in to view this transaction." };
  }

  // Determine user role (BUYER vs SELLER/OWNER)
  const isSellerOrOwner =
    req.vehicle?.ownerId === userId ||
      req.listing?.sellerId === userId ||
      req.parties.some((p) => p.userId === userId && (p.partyType === "SELLER" || p.partyType === "DEALER"));

  const isBuyer =
    req.buyerId === userId ||
    req.parties.some((p) => p.userId === userId && p.partyType === "BUYER");

  if (!isBuyer && !isSellerOrOwner) {
    return { error: "FORBIDDEN", message: "You do not have access to this transaction." };
  }

  const role: "BUYER" | "SELLER" = isSellerOrOwner ? "SELLER" : "BUYER";

  // Parse package scope
  const primaryPackage = req.packages[0];
  let parsedScope: Record<string, unknown> = {};
  if (primaryPackage?.scope) {
    try {
      parsedScope = JSON.parse(primaryPackage.scope);
    } catch {
      parsedScope = { raw: primaryPackage.scope };
    }
  }

  if (role === "SELLER") {
    // Owner / Seller Scoped View:
    // Excludes private buyer user history and partner decision tokens.
    const buyerParty = req.parties.find((p) => p.partyType === "BUYER");
    return {
      success: true,
      role: "SELLER" as const,
      request: {
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
        requestSummary: {
          title: primaryPackage?.title || "Fulfillment Request",
          description: primaryPackage?.description,
          buyerName: buyerParty?.name || "Verified Buyer",
          buyerCity: buyerParty?.address ? buyerParty.address.split(",")[1]?.trim() || null : null,
          scopedSummary: sanitizeScopedDataForOwner(parsedScope),
        },
        depositHold: req.depositIntents[0]
          ? {
              amount: req.depositIntents[0].amount,
              currency: req.depositIntents[0].currency,
              status: req.depositIntents[0].status,
            }
          : null,
        events: sanitizeUserFacingEvents(req.events),
      },
    };
  }

  // Buyer Scoped View:
  // Includes full buyer info, vehicle specs, package status, fees, deposit hold, and timeline next steps.
  return {
    success: true,
    role: "BUYER" as const,
    request: {
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
      package: {
        title: primaryPackage?.title || "Fulfillment Package",
        description: primaryPackage?.description,
        scopedData: parsedScope,
      },
      parties: req.parties,
      fees: req.fees,
      depositIntents: req.depositIntents,
      events: sanitizeUserFacingEvents(req.events),
      nextSteps: getNextStepsForStatus(req.status),
    },
  };
}

/**
 * Dedicated handler for `/fulfillment/[token]/accept` and `/fulfillment/[token]/decline`.
 * Enforces single-purpose token rule (cannot reuse once actionTaken is set).
 */
export async function executePartnerDecisionByAction(
  token: string,
  action: "ACCEPT" | "DECLINE",
  note?: string,
  auditContext?: PartnerDecisionInput["auditContext"]
) {
  const tokenRecord = await prisma.partnerDecisionToken.findUnique({
    where: { token },
  });

  if (!tokenRecord) {
    return { error: "INVALID_TOKEN", message: "Fulfillment token not found." };
  }

  // Single-purpose token enforcement
  if (tokenRecord.actionTaken) {
    return {
      error: "TOKEN_ALREADY_USED",
      message: `Token has already been used to submit decision '${tokenRecord.actionTaken}'.`,
    };
  }

  if (tokenRecord.expiresAt && new Date() > tokenRecord.expiresAt) {
    await expirePartnerDecisionToken(tokenRecord.id);
    return { error: "TOKEN_EXPIRED", message: "This fulfillment decision token has expired." };
  }

  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: tokenRecord.fulfillmentRequestId },
    select: { status: true },
  });
  if (!req || TERMINAL_FULFILLMENT_STATUSES.has(req.status)) {
    return {
      error: "REQUEST_ALREADY_FINALIZED",
      message: `Fulfillment request is already finalized${req ? ` as ${req.status}` : ""}.`,
    };
  }

  const decision = action === "ACCEPT" ? "ACCEPTED" : "DECLINED";

  const result = await submitPartnerDecision({
    token,
    decision,
    note: note || `Partner executed ${action.toLowerCase()} via tokenized endpoint`,
    auditContext,
  });

  return result;
}

/**
 * Re-dispatches a declined or expired fulfillment request to an alternative partner contact.
 */
export async function reDispatchFulfillmentRequest(
  originalRequestId: string,
  newPartnerName: string,
  newPartnerEmail?: string
) {
  const original = await prisma.fulfillmentRequest.findUnique({
    where: { id: originalRequestId },
    include: {
      packages: true,
      parties: true,
      depositIntents: true,
      fees: true,
    },
  });

  if (!original) {
    throw new Error(`Original FulfillmentRequest not found: ${originalRequestId}`);
  }

  const primaryPackage = original.packages[0];
  let parsedScope: Record<string, unknown> = {};
  if (primaryPackage?.scope) {
    try {
      parsedScope = JSON.parse(primaryPackage.scope);
    } catch {
      // keep empty
    }
  }

  // Create new fulfillment request for alternative partner
  const newRequest = await createFulfillmentRequest({
    requestType: original.requestType as FulfillmentRequestType,
    purchaseId: original.purchaseId || undefined,
    vehicleId: original.vehicleId || undefined,
    listingId: original.listingId || undefined,
    buyerId: original.buyerId || undefined,
    packageTitle: primaryPackage?.title || "Re-dispatched Fulfillment Request",
    packageDescription: `Re-dispatched request to ${newPartnerName}`,
    scopedPackageData: parsedScope,
    partnerName: newPartnerName,
    partnerEmail: newPartnerEmail || null,
    partnerType: getPartnerTypeForRequest(original.requestType as FulfillmentRequestType),
    status: "SENT",
    parties: original.parties.map((party) => ({
      partyType: party.partyType as FulfillmentPartyType,
      userId: party.userId || undefined,
      name: party.partyType === "TRANSPORT_PROVIDER" || party.partyType === "DEALER" || party.partyType === "INSURANCE_CARRIER" || party.partyType === "SERVICE_CENTER"
        ? newPartnerName
        : party.name,
      email: party.partyType === "TRANSPORT_PROVIDER" || party.partyType === "DEALER" || party.partyType === "INSURANCE_CARRIER" || party.partyType === "SERVICE_CENTER"
        ? newPartnerEmail
        : party.email || undefined,
      phone: party.phone || undefined,
      companyName: party.companyName || undefined,
      address: party.address || undefined,
      roleDescription: party.roleDescription || undefined,
    })),
    fees: original.fees.map((fee) => {
      const feeType = fee.feeType as FulfillmentFeeType;
      const status = feeType === "DEPOSIT"
        ? "AUTHORIZED"
        : fee.status === "CAPTURED" || fee.status === "REFUNDED"
        ? "ESTIMATED"
        : fee.status as "ESTIMATED" | "AUTHORIZED" | "WAIVED";

      return {
        feeType,
        amount: fee.amount,
        currency: fee.currency,
        description: fee.description || undefined,
        status,
      };
    }),
    depositIntent: original.depositIntents[0]
      ? {
          amount: original.depositIntents[0].amount,
          paymentMethod: original.depositIntents[0].paymentMethod || "CREDIT_CARD_HOLD",
        }
      : undefined,
  });

  // Log audit event on original request referencing re-dispatch
  await prisma.fulfillmentEvent.create({
    data: {
      fulfillmentRequestId: originalRequestId,
      previousStatus: original.status,
      newStatus: "CANCELLED",
      actorType: "SYSTEM",
      note: `Request re-dispatched to alternative partner '${newPartnerName}' (New Request ID: ${newRequest.id})`,
    },
  });

  return newRequest;
}

export interface CancelFulfillmentRequestParams {
  fulfillmentRequestId: string;
  cancelledByActor: "BUYER" | "PARTNER" | "SYSTEM" | "ADMIN";
  cancellationReason: string;
}

/**
 * Handles request cancellation (pre-acceptance vs. post-acceptance).
 * Applies cancellation policies, records cancellation actor & reason,
 * and manages deposit releases/refunds.
 */
export async function cancelFulfillmentRequest(params: CancelFulfillmentRequestParams) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: params.fulfillmentRequestId },
    include: { depositIntents: true, fees: true, parties: true },
  });

  if (!req) {
    throw new Error(`FulfillmentRequest not found: ${params.fulfillmentRequestId}`);
  }

  if (["DECLINED", "EXPIRED", "CANCELLED", "COMPLETED"].includes(req.status)) {
    return { success: false, message: `Request is already in '${req.status}' state.` };
  }

  const isPreAcceptance = req.status !== "ACCEPTED";
  const previousStatus = req.status;
  const policyFee = 100;
  const originalDeposit = req.depositIntents[0]?.amount || req.collectedAmount || 0;
  const refundAmount = Math.max(0, originalDeposit - policyFee);

  try {
    if (isPreAcceptance) {
      for (const deposit of req.depositIntents) {
        if (deposit.status === "AUTHORIZED" || deposit.status === "HELD") {
          await voidDeposit(deposit.transactionRef || "");
        }
      }
    } else {
      let remainingRefundAmount = refundAmount;
      for (const deposit of req.depositIntents) {
        if (deposit.status === "CAPTURED") {
          const amountToRefund = Math.min(deposit.amount, remainingRefundAmount);
          if (amountToRefund > 0) {
            await refundDeposit(deposit.transactionRef || "", amountToRefund);
            remainingRefundAmount -= amountToRefund;
          }
        } else if (deposit.status === "AUTHORIZED" || deposit.status === "HELD") {
          await voidDeposit(deposit.transactionRef || "");
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment settlement failed.";
    await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus,
        newStatus: previousStatus,
        actorType: params.cancelledByActor as FulfillmentActorType,
        note: `Cancellation payment settlement failed before request finalization: ${message}`,
      },
    });
    return {
      success: false,
      message: `Cancellation blocked because payment settlement failed: ${message}`,
    };
  }

  await prisma.$transaction(async (tx) => {
    if (isPreAcceptance) {
      // Pre-acceptance cancellation: 100% deposit authorization voided/released
      for (const deposit of req.depositIntents) {
        await tx.depositIntent.update({
          where: { id: deposit.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      }
      for (const fee of req.fees) {
        await tx.fulfillmentFee.update({
          where: { id: fee.id },
          data: { status: "REFUNDED" },
        });
      }

      await tx.fulfillmentRequest.update({
        where: { id: req.id },
        data: {
          status: "CANCELLED",
          paymentStatus: "VOIDED",
          cancellationReason: params.cancellationReason,
          cancelledByActor: params.cancelledByActor,
          refundableAmount: 0,
        },
      });

      await tx.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: req.id,
          previousStatus,
          newStatus: "CANCELLED",
          actorType: params.cancelledByActor as FulfillmentActorType,
          note: `Request cancelled PRE-ACCEPTANCE by ${params.cancelledByActor}. Reason: ${params.cancellationReason}. 100% deposit authorization released.`,
        },
      });
    } else {
      // Post-acceptance cancellation: Apply policy deduction (e.g. forfeit $100 processing fee if deposit captured)
      for (const deposit of req.depositIntents) {
        await tx.depositIntent.update({
          where: { id: deposit.id },
          data: { status: "REFUNDED", releasedAt: new Date() },
        });
      }
      for (const fee of req.fees) {
        await tx.fulfillmentFee.update({
          where: { id: fee.id },
          data: { status: "REFUNDED" },
        });
      }

      await tx.fulfillmentRequest.update({
        where: { id: req.id },
        data: {
          status: "CANCELLED",
          paymentStatus: "REFUNDED",
          cancellationReason: params.cancellationReason,
          cancelledByActor: params.cancelledByActor,
          refundableAmount: 0,
          collectedAmount: policyFee, // Net retained policy fee
          payoutStatus: "PENDING_RECONCILIATION",
        },
      });

      await tx.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: req.id,
          previousStatus,
          newStatus: "CANCELLED",
          actorType: params.cancelledByActor as FulfillmentActorType,
          note: `Request cancelled POST-ACCEPTANCE by ${params.cancelledByActor}. Reason: ${params.cancellationReason}. Policy fee of $${policyFee} retained; $${refundAmount} refunded.`,
        },
      });
    }
  });

  // Dispatch cancellation & refund notification email to buyer party
  const buyerParty = req.parties.find((p) => p.partyType === "BUYER");
  if (buyerParty && buyerParty.email) {
    await sendFulfillmentEmail({
      fulfillmentRequestId: req.id,
      templateType: "CANCELLATION_REFUND_NOTIFICATION",
      recipientName: buyerParty.name,
      recipientEmail: buyerParty.email,
      packageTitle: `Request Cancelled & Settled`,
      vehicleSummary: "Fulfillment Request Cancellation",
      reviewUrl: `/transactions/${req.publicTransactionToken}`,
      additionalDetails: {
        "Cancelled By": params.cancelledByActor,
        "Cancellation Reason": params.cancellationReason,
      },
    });
  }

  return {
    success: true,
    message: `Request successfully cancelled. ${isPreAcceptance ? "Deposit authorization released." : "Cancellation policy applied."}`,
  };
}

/**
 * Scans and processes expired fulfillment requests.
 * Automatically transitions status to EXPIRED and voids deposit holds.
 */
/**
 * Processes expired partner decision tokens.
 * For each token past its expiresAt with no actionTaken, marks the associated
 * fulfillment request as EXPIRED, releases any authorized/held deposits, refunds
 * pending fees, and logs appropriate audit events.
 */
export async function processExpiredFulfillmentRequests() {
  const expiredTokens = await prisma.partnerDecisionToken.findMany({
    where: {
      expiresAt: { lte: new Date() },
      actionTaken: null,
    },
    include: { fulfillmentRequest: true },
  });

  let count = 0;
  for (const tokenRecord of expiredTokens) {
    const req = tokenRecord.fulfillmentRequest;
    if (!req) continue;

    const expiration = await expirePartnerDecisionToken(tokenRecord.id);
    if (!expiration.processed) continue;

    // Dispatch expiration notification to buyer party
    const reqWithParties = await prisma.fulfillmentRequest.findUnique({
      where: { id: req.id },
      include: { parties: true },
    });
    const buyerParty = reqWithParties?.parties.find((p) => p.partyType === "BUYER");
    if (buyerParty && buyerParty.email) {
      await sendFulfillmentEmail({
        fulfillmentRequestId: req.id,
        templateType: "EXPIRED_NOTIFICATION",
        recipientName: buyerParty.name,
        recipientEmail: buyerParty.email,
        packageTitle: `Decision Link Expired`,
        vehicleSummary: "Fulfillment Request Expiration",
        reviewUrl: `/transactions/${req.publicTransactionToken}`,
      });
    }

    count++;
  }

  return { processedCount: count };
}

async function expirePartnerDecisionToken(tokenId: string) {
  const tokenRecord = await prisma.partnerDecisionToken.findUnique({
    where: { id: tokenId },
    include: {
      fulfillmentRequest: {
        include: {
          depositIntents: true,
          fees: true,
        },
      },
    },
  });

  if (!tokenRecord || tokenRecord.actionTaken) {
    return { processed: false, requestId: tokenRecord?.fulfillmentRequestId || null };
  }

  const req = tokenRecord.fulfillmentRequest;
  if (TERMINAL_FULFILLMENT_STATUSES.has(req.status)) {
    await prisma.partnerDecisionToken.update({
      where: { id: tokenRecord.id },
      data: {
        actionTaken: "EXPIRED",
        actionTakenAt: new Date(),
      },
    });
    return { processed: false, requestId: req.id };
  }

  try {
    for (const deposit of req.depositIntents) {
      if (deposit.status === "AUTHORIZED" || deposit.status === "HELD") {
        await voidDeposit(deposit.transactionRef || "");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment authorization void failed.";
    await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus: req.status,
        newStatus: req.status,
        actorType: "SYSTEM",
        note: `Expiration payment void failed before request finalization: ${message}`,
      },
    });
    return { processed: false, requestId: req.id };
  }

  await prisma.$transaction(async (tx) => {
    await tx.partnerDecisionToken.update({
      where: { id: tokenRecord.id },
      data: {
        actionTaken: "EXPIRED",
        actionTakenAt: new Date(),
      },
    });

    await tx.fulfillmentRequest.update({
      where: { id: req.id },
      data: {
        status: "EXPIRED",
        paymentStatus: req.depositIntents.length > 0 ? "VOIDED" : req.paymentStatus,
        refundableAmount: 0,
      },
    });

    for (const deposit of req.depositIntents) {
      if (deposit.status === "AUTHORIZED" || deposit.status === "HELD") {
        await tx.depositIntent.update({
          where: { id: deposit.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      }
    }

    for (const fee of req.fees) {
      if (fee.status === "AUTHORIZED" || fee.status === "ESTIMATED") {
        await tx.fulfillmentFee.update({
          where: { id: fee.id },
          data: { status: "REFUNDED" },
        });
      }
    }

    await tx.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus: req.status,
        newStatus: "EXPIRED",
        actorType: "SYSTEM",
        note: "Partner decision token expired; request marked EXPIRED and authorization holds released.",
      },
    });
  });

  return { processed: true, requestId: req.id };
}

function getNextStepsForStatus(status: string): string[] {
  switch (status) {
    case "DRAFT":
      return ["Complete missing buyer parameters", "Submit request to partner network"];
    case "SENT":
      return ["Awaiting partner access", "Refined notification sent to fulfillment partner"];
    case "VIEWED":
      return ["Partner is reviewing package terms", "Awaiting formal partner decision"];
    case "ACCEPTED":
      return [
        "Partner decision confirmed",
        "Deposit authorization hold captured",
        "Final ownership fulfillment documents generated",
      ];
    case "DECLINED":
      return [
        "Partner declined request",
        "Deposit authorization hold released",
        "Select alternative partner or refine request terms",
      ];
    case "COMPLETED":
      return ["Fulfillment completed", "Vehicle added to owner garage profile"];
    default:
      return ["Track fulfillment status in dashboard"];
  }
}

function sanitizeScopedDataForOwner(scope: Record<string, unknown>): Record<string, unknown> {
  const blockedKeys = new Set([
    "buyerEmail",
    "customerEmail",
    "dealerEmail",
    "carrierEmail",
    "shopEmail",
    "transporterEmail",
    "decisionTokenUrl",
    "acceptUrl",
    "declineUrl",
    "contactPhone",
    "buyerPhone",
    "customerPhone",
  ]);

  return Object.fromEntries(
    Object.entries(scope)
      .filter(([key]) => !blockedKeys.has(key))
      .map(([key, value]) => [key, sanitizeScopedValue(value, blockedKeys)])
  );
}

function sanitizeScopedValue(value: unknown, blockedKeys: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeScopedValue(item, blockedKeys));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blockedKeys.has(key))
      .map(([key, nested]) => [key, sanitizeScopedValue(nested, blockedKeys)])
  );
}

function sanitizeUserFacingEvents(
  events: Array<{
    id: string;
    fulfillmentRequestId: string;
    previousStatus: string | null;
    newStatus: string;
    actorType: string;
    actorId: string | null;
    note: string | null;
    metadata: string | null;
    createdAt: Date;
  }>
) {
  return events.map((event) => ({
    id: event.id,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    actorType: event.actorType,
    createdAt: event.createdAt,
  }));
}
