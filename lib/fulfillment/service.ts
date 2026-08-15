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
import {
  getCancellationSettlement,
  getPartnerDecisionStatus,
} from "@/lib/payments/payment-policy";
import type {
  CreateFulfillmentRequestInput,
  FulfillmentActorType,
  FulfillmentFeeType,
  FulfillmentPartyType,
  FulfillmentRequestType,
  FulfillmentStatus,
  PartnerDecisionInput,
} from "./types";
import { Prisma } from "@prisma/client";
import {
  enforceActionRateLimit,
  hashRateLimitIdentifier,
  isActionRateLimitError,
} from "@/lib/security/action-rate-limit";

const TERMINAL_FULFILLMENT_STATUSES = new Set([
  "ACCEPTED",
  "CONFIRMED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
  "COMPLETED",
  "SERVICE_COMPLETED",
  "REFUNDED",
]);

const transactionVehicleSelect = {
  id: true,
  ownerId: true,
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
  photos: {
    select: {
      filePath: true,
    },
    take: 1,
  },
};

const transactionPartySelect = {
  id: true,
  userId: true,
  partyType: true,
  name: true,
  email: true,
  companyName: true,
  address: true,
  roleDescription: true,
};

const transactionFeeSelect = {
  id: true,
  feeType: true,
  amount: true,
  currency: true,
  status: true,
  description: true,
};

const transactionDepositSelect = {
  id: true,
  amount: true,
  currency: true,
  status: true,
};

const depositSettlementSelect = {
  id: true,
  amount: true,
  status: true,
  transactionRef: true,
};

const feeSettlementSelect = {
  id: true,
  feeType: true,
  status: true,
};

const transactionDetailEventSelect = {
  id: true,
  fulfillmentRequestId: true,
  previousStatus: true,
  newStatus: true,
  actorType: true,
  actorId: true,
  note: true,
  metadata: true,
  createdAt: true,
};

const transactionListRequestSelect = {
  id: true,
  publicTransactionToken: true,
  requestType: true,
  status: true,
  paymentStatus: true,
  expectedPlatformFee: true,
  expectedPartnerCommission: true,
  collectedAmount: true,
  createdAt: true,
  updatedAt: true,
  vehicle: {
    select: transactionVehicleSelect,
  },
  listing: {
    select: {
      sellerId: true,
    },
  },
} satisfies Prisma.FulfillmentRequestSelect;

export const USER_FULFILLMENT_PAGE_SIZE = 25;

export type UserFulfillmentCategory =
  | "ALL"
  | "BUYING"
  | "SELLING"
  | "SERVICE_BOOKINGS"
  | "INSURANCE_REQUESTS"
  | "TRANSPORT_REQUESTS";

export type UserFulfillmentFilters = {
  category?: UserFulfillmentCategory;
  search?: string;
};

function getUserFulfillmentWhere(userId: string, filters?: UserFulfillmentFilters) {
  const accessWhere: Prisma.FulfillmentRequestWhereInput = {
    OR: [
      { buyerId: userId },
      { parties: { some: { userId } } },
      { vehicle: { ownerId: userId } },
      { listing: { sellerId: userId } },
    ],
  };
  const predicates: Prisma.FulfillmentRequestWhereInput[] = [accessWhere];

  switch (filters?.category) {
    case "BUYING":
      predicates.push({
        requestType: "DEALER_PURCHASE",
        NOT: {
          OR: [
            { vehicle: { ownerId: userId } },
            { listing: { sellerId: userId } },
          ],
        },
      });
      break;
    case "SELLING":
      predicates.push({
        requestType: "DEALER_PURCHASE",
        OR: [
          { vehicle: { ownerId: userId } },
          { listing: { sellerId: userId } },
        ],
      });
      break;
    case "SERVICE_BOOKINGS":
      predicates.push({ requestType: "SERVICE_BOOKING" });
      break;
    case "INSURANCE_REQUESTS":
      predicates.push({ requestType: "INSURANCE_QUOTE" });
      break;
    case "TRANSPORT_REQUESTS":
      predicates.push({ requestType: "TRANSPORT_QUOTE" });
      break;
  }

  const search = filters?.search?.trim();
  if (search) {
    predicates.push({
      OR: [
        { vehicle: { vin: { contains: search, mode: "insensitive" } } },
        { vehicle: { model: { name: { contains: search, mode: "insensitive" } } } },
        { vehicle: { model: { make: { name: { contains: search, mode: "insensitive" } } } } },
        { parties: { some: { name: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  return { AND: predicates } satisfies Prisma.FulfillmentRequestWhereInput;
}

const transactionDetailRequestSelect = {
  id: true,
  buyerId: true,
  publicTransactionToken: true,
  requestType: true,
  status: true,
  paymentStatus: true,
  expectedPlatformFee: true,
  expectedPartnerCommission: true,
  collectedAmount: true,
  refundableAmount: true,
  payoutStatus: true,
  cancellationReason: true,
  cancelledByActor: true,
  createdAt: true,
  updatedAt: true,
  parties: {
    select: transactionPartySelect,
  },
  packages: {
    select: {
      id: true,
      title: true,
      description: true,
      scope: true,
    },
    take: 1,
  },
  events: {
    select: transactionDetailEventSelect,
    orderBy: { createdAt: "desc" as const },
    take: 100,
  },
  fees: {
    select: transactionFeeSelect,
    take: 10,
  },
  depositIntents: {
    select: transactionDepositSelect,
    take: 10,
  },
  vehicle: {
    select: transactionVehicleSelect,
  },
  listing: {
    select: {
      id: true,
      sellerId: true,
      askingPrice: true,
    },
  },
};

const buyerFulfillmentTransactionSelect = {
  id: true,
  publicTransactionToken: true,
  requestType: true,
  status: true,
  paymentStatus: true,
  parties: {
    select: transactionPartySelect,
    take: 10,
  },
  events: {
    select: {
      id: true,
      previousStatus: true,
      newStatus: true,
      actorType: true,
      actorId: true,
      note: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 100,
  },
  fees: {
    select: transactionFeeSelect,
    take: 10,
  },
  depositIntents: {
    select: transactionDepositSelect,
    take: 10,
  },
  vehicle: {
    select: {
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
};

const partnerFulfillmentPackageTokenSelect = {
  id: true,
  token: true,
  actionTaken: true,
  actionTakenAt: true,
  expiresAt: true,
  viewedAt: true,
  partnerName: true,
  fulfillmentRequest: {
    select: {
      id: true,
      requestType: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      packages: {
        select: {
          title: true,
          description: true,
          scope: true,
        },
        take: 1,
      },
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
          photos: {
            select: {
              filePath: true,
            },
            take: 1,
          },
        },
      },
      depositIntents: {
        select: {
          amount: true,
          currency: true,
          status: true,
        },
        take: 1,
      },
    },
  },
};

const partnerDecisionTokenSelect = {
  id: true,
  token: true,
  actionTaken: true,
  expiresAt: true,
  viewedAt: true,
  partnerName: true,
  partnerEmail: true,
  fulfillmentRequest: {
    select: {
      id: true,
      requestType: true,
      status: true,
      paymentStatus: true,
      collectedAmount: true,
      publicTransactionToken: true,
      depositIntents: {
        select: depositSettlementSelect,
      },
      fees: {
        select: feeSettlementSelect,
      },
      parties: {
        select: {
          id: true,
          partyType: true,
          name: true,
          email: true,
        },
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
  },
};

const cancellationFulfillmentRequestSelect = {
  id: true,
  status: true,
  paymentStatus: true,
  publicTransactionToken: true,
  collectedAmount: true,
  depositIntents: {
    select: depositSettlementSelect,
  },
  fees: {
    select: feeSettlementSelect,
  },
  parties: {
    select: {
      id: true,
      partyType: true,
      name: true,
      email: true,
    },
  },
};

const partnerServiceCancellationTokenSelect = {
  id: true,
  actionTaken: true,
  partnerName: true,
  partnerEmail: true,
  fulfillmentRequest: {
    select: {
      id: true,
      requestType: true,
      status: true,
      paymentStatus: true,
      publicTransactionToken: true,
      depositIntents: {
        select: depositSettlementSelect,
      },
      fees: {
        select: feeSettlementSelect,
      },
      parties: {
        select: {
          id: true,
          partyType: true,
          name: true,
          email: true,
        },
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
  },
};

const expirePartnerDecisionTokenSelect = {
  id: true,
  actionTaken: true,
  fulfillmentRequestId: true,
  fulfillmentRequest: {
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      publicTransactionToken: true,
      parties: {
        where: { partyType: "BUYER" },
        select: {
          name: true,
          email: true,
        },
        take: 1,
      },
      depositIntents: {
        select: depositSettlementSelect,
      },
      fees: {
        select: feeSettlementSelect,
      },
    },
  },
};

type ExpirePartnerDecisionTokenRecord = Prisma.PartnerDecisionTokenGetPayload<{
  select: typeof expirePartnerDecisionTokenSelect;
}>;

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
  if (!partnerEmailValid && (initialStatus === "SENT" || initialStatus === "READY_TO_SEND")) {
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
  const initialPaymentStatus = input.paymentStatus || (input.depositIntent ? "AUTHORIZED" : "NOT_REQUIRED");
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
  if (!input.suppressBuyerConfirmation && buyerParty && buyerParty.email) {
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
    select: partnerFulfillmentPackageTokenSelect,
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
            amount: Number(req.depositIntents[0].amount),
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
    select: buyerFulfillmentTransactionSelect,
  });

  if (!req) {
    return { error: "NOT_FOUND", message: "Transaction not found." };
  }

  return {
    success: true,
    request: {
      ...req,
      fees: req.fees.map((fee) => ({ ...fee, amount: Number(fee.amount) })),
      depositIntents: req.depositIntents.map((deposit) => ({
        ...deposit,
        amount: Number(deposit.amount),
      })),
      events: [...req.events].reverse(),
    },
  };
}

/**
 * Handles a partner's decision (ACCEPT or DECLINE) via their tokenized link.
 * Updates request status, logs audit event, and enforces payment hold rules.
 */
export async function submitPartnerDecision(input: PartnerDecisionInput) {
  const tokenRecord = await prisma.partnerDecisionToken.findUnique({
    where: { token: input.token },
    select: partnerDecisionTokenSelect,
  });

  if (!tokenRecord) {
    return { error: "INVALID_TOKEN", message: "Token not found or invalid." };
  }
  try {
    await enforceActionRateLimit({
      actorId: hashRateLimitIdentifier(input.token),
      action: "partner_decision",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
  } catch (error) {
    if (isActionRateLimitError(error)) {
      return { error: "RATE_LIMITED", message: error.message };
    }
    throw error;
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
  const hasAuthorizedServiceBooking = req.requestType === "SERVICE_BOOKING" &&
    (req.paymentStatus === "AUTHORIZED" || req.paymentStatus === "PAID");
  const newStatus = (
    getPartnerDecisionStatus(req.requestType, input.decision, req.paymentStatus)
  ) as FulfillmentStatus;
  const eligibleDeposits = req.depositIntents.filter((deposit) => deposit.status === "AUTHORIZED" || deposit.status === "HELD");
  const capturedDeposits = req.depositIntents.filter((deposit) => deposit.status === "CAPTURED");
  let totalCaptured = 0;

  try {
    if (
      req.requestType === "SERVICE_BOOKING" &&
      req.paymentStatus === "AUTHORIZED" &&
      eligibleDeposits.length === 0
    ) {
      throw new Error("Authorized service booking is missing its payment authorization record.");
    }
    if (
      input.decision === "ACCEPTED" &&
      (req.requestType !== "SERVICE_BOOKING" || hasAuthorizedServiceBooking)
    ) {
      for (const deposit of eligibleDeposits) {
        const amount = Number(deposit.amount);
        await captureDeposit(deposit.transactionRef || "", amount);
        totalCaptured += amount;
      }
    } else if (input.decision === "DECLINED") {
      for (const deposit of eligibleDeposits) {
        await voidDeposit(deposit.transactionRef || "");
      }
      if (req.requestType === "DEALER_PURCHASE" || req.requestType === "SERVICE_BOOKING") {
        for (const deposit of capturedDeposits) {
          await refundDeposit(deposit.transactionRef || "", Number(deposit.amount));
        }
      }
    }
  } catch (error) {
    const operation = input.decision === "ACCEPTED" ? "capture" : "void/refund";
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
    if (input.decision === "ACCEPTED" && req.requestType === "SERVICE_BOOKING") {
      if (hasAuthorizedServiceBooking) {
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
        for (const fee of req.fees) {
          if (fee.feeType === "SERVICE_FEE" && (fee.status === "AUTHORIZED" || fee.status === "ESTIMATED")) {
            await tx.fulfillmentFee.update({
              where: { id: fee.id },
              data: { status: "CAPTURED" },
            });
          }
        }
        await tx.fulfillmentRequest.update({
          where: { id: req.id },
          data: {
            status: "CONFIRMED",
            paymentStatus: "PAID",
            partnerAcceptedAt: new Date(),
            collectedAmount: totalCaptured || req.collectedAmount,
            payoutStatus: "PENDING_RECONCILIATION",
          },
        });
      } else {
        for (const fee of req.fees) {
          if (fee.feeType === "SERVICE_FEE" && fee.status === "ESTIMATED") {
            await tx.fulfillmentFee.update({
              where: { id: fee.id },
              data: { status: "AUTHORIZED" },
            });
          }
        }

        await tx.fulfillmentRequest.update({
          where: { id: req.id },
          data: {
            status: "ACCEPTED_AWAITING_PAYMENT",
            paymentStatus: "PAYMENT_REQUIRED",
            partnerAcceptedAt: new Date(),
            payoutStatus: "UNSETTLED",
          },
        });
      }
    } else if (input.decision === "ACCEPTED") {
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
        : req.requestType === "DEALER_PURCHASE"
          ? "PAID"
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
      // Release pending holds and refund already-paid dealer purchase deposits if declined.
      for (const deposit of req.depositIntents) {
        if (deposit.status === "AUTHORIZED" || deposit.status === "HELD") {
          await tx.depositIntent.update({
            where: { id: deposit.id },
            data: {
              status: "RELEASED",
              releasedAt: new Date(),
            },
          });
        } else if ((req.requestType === "DEALER_PURCHASE" || req.requestType === "SERVICE_BOOKING") && deposit.status === "CAPTURED") {
          await tx.depositIntent.update({
            where: { id: deposit.id },
            data: {
              status: "REFUNDED",
              releasedAt: new Date(),
            },
          });
        }
      }
      for (const fee of req.fees) {
        if (fee.status === "AUTHORIZED" || fee.status === "ESTIMATED" ||
          (req.requestType === "SERVICE_BOOKING" && fee.status === "CAPTURED")) {
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
          paymentStatus:
            (req.requestType === "DEALER_PURCHASE" || req.requestType === "SERVICE_BOOKING") && capturedDeposits.length > 0
              ? "REFUNDED"
              : "VOIDED",
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
      packageTitle:
        input.decision === "ACCEPTED" && req.requestType === "SERVICE_BOOKING"
          ? hasAuthorizedServiceBooking
            ? `Service booking confirmed by '${tokenRecord.partnerName || "Service shop"}'`
            : `Service booking accepted by '${tokenRecord.partnerName || "Service shop"}' — payment required`
          : `Request ${input.decision.toLowerCase()} by partner '${tokenRecord.partnerName || "Partner"}'`,
      vehicleSummary,
      reviewUrl:
        input.decision === "ACCEPTED" && req.requestType === "SERVICE_BOOKING" && !hasAuthorizedServiceBooking
          ? `/fulfillment/buyer/${req.publicTransactionToken}`
          : `/transactions/${req.publicTransactionToken}`,
      additionalDetails:
        input.decision === "ACCEPTED" && req.requestType === "SERVICE_BOOKING" && !hasAuthorizedServiceBooking
          ? {
              "Next Step": "Pay the SUPERCAR DASH service-booking fee to confirm the appointment.",
              "Payment Status": "PAYMENT_REQUIRED",
            }
          : undefined,
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
export async function getUserFulfillmentTransactions(
  userId: string,
  filters?: UserFulfillmentFilters,
  page = 1,
) {
  const requests = await prisma.fulfillmentRequest.findMany({
    where: getUserFulfillmentWhere(userId, filters),
    select: transactionListRequestSelect,
    orderBy: { updatedAt: "desc" },
    skip: (Math.max(1, page) - 1) * USER_FULFILLMENT_PAGE_SIZE,
    take: USER_FULFILLMENT_PAGE_SIZE,
  });

  if (requests.length === 0) return [];

  type LatestEventRow = {
    id: string;
    fulfillmentRequestId: string;
    createdAt: Date;
    newStatus: string;
    note: string | null;
  };
  type SummaryPartyRow = {
    id: string;
    fulfillmentRequestId: string;
    partyType: string;
    name: string;
    email: string | null;
    companyName: string | null;
    roleDescription: string | null;
  };
  type SummaryDepositRow = {
    id: string;
    fulfillmentRequestId: string;
    amount: number;
    currency: string;
    status: string;
  };
  const requestIds = requests.map((request) => request.id);
  const [latestEvents, summaryParties, latestDeposits] = await Promise.all([
    prisma.$queryRaw<LatestEventRow[]>(Prisma.sql`
      SELECT DISTINCT ON (event."fulfillmentRequestId")
        event."id", event."fulfillmentRequestId", event."createdAt", event."newStatus", event."note"
      FROM "FulfillmentEvent" event
      WHERE event."fulfillmentRequestId" IN (${Prisma.join(requestIds)})
      ORDER BY event."fulfillmentRequestId", event."createdAt" DESC
    `),
    prisma.$queryRaw<SummaryPartyRow[]>(Prisma.sql`
      WITH ranked_parties AS (
        SELECT party."id", party."fulfillmentRequestId", party."partyType", party."name",
          party."email", party."companyName", party."roleDescription",
          ROW_NUMBER() OVER (
            PARTITION BY party."fulfillmentRequestId"
            ORDER BY
              CASE
                WHEN party."partyType" NOT IN ('BUYER', 'SELLER', 'PLATFORM') THEN 0
                WHEN party."partyType" = 'SELLER' THEN 1
                ELSE 2
              END,
              party."createdAt" ASC
          ) AS party_rank
        FROM "FulfillmentParty" party
        WHERE party."fulfillmentRequestId" IN (${Prisma.join(requestIds)})
      )
      SELECT "id", "fulfillmentRequestId", "partyType", "name", "email", "companyName", "roleDescription"
      FROM ranked_parties
      WHERE party_rank = 1
    `),
    prisma.$queryRaw<SummaryDepositRow[]>(Prisma.sql`
      SELECT DISTINCT ON (deposit."fulfillmentRequestId")
        deposit."id", deposit."fulfillmentRequestId", deposit."amount"::double precision AS "amount",
        deposit."currency", deposit."status"
      FROM "DepositIntent" deposit
      WHERE deposit."fulfillmentRequestId" IN (${Prisma.join(requestIds)})
      ORDER BY deposit."fulfillmentRequestId", deposit."createdAt" DESC
    `),
  ]);
  const eventByRequestId = new Map(latestEvents.map((event) => [event.fulfillmentRequestId, event]));
  const partyByRequestId = new Map(summaryParties.map((party) => [party.fulfillmentRequestId, party]));
  const depositByRequestId = new Map(latestDeposits.map((deposit) => [deposit.fulfillmentRequestId, deposit]));

  return requests.map((request) => ({
    ...request,
    expectedPlatformFee: Number(request.expectedPlatformFee),
    expectedPartnerCommission: Number(request.expectedPartnerCommission),
    collectedAmount: Number(request.collectedAmount),
    parties: partyByRequestId.has(request.id) ? [partyByRequestId.get(request.id)!] : [],
    fees: [],
    depositIntents: depositByRequestId.has(request.id) ? [depositByRequestId.get(request.id)!] : [],
    events: eventByRequestId.has(request.id) ? [eventByRequestId.get(request.id)!] : [],
  }));
}

export function getUserFulfillmentTransactionCount(userId: string, filters?: UserFulfillmentFilters) {
  return prisma.fulfillmentRequest.count({ where: getUserFulfillmentWhere(userId, filters) });
}

export async function getUserFulfillmentSummary(userId: string) {
  type SummaryRow = {
    total: bigint;
    active: bigint;
    attention: bigint;
    captured: number | null;
    buying: bigint;
    selling: bigint;
    service: bigint;
    insurance: bigint;
    transport: bigint;
  };
  const [summary] = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
    WITH accessible AS (
      SELECT request."id", request."requestType", request."status", request."paymentStatus",
        request."collectedAmount", request."vehicleId", request."listingId"
      FROM "FulfillmentRequest" request
      WHERE request."buyerId" = ${userId}
        OR EXISTS (
          SELECT 1 FROM "FulfillmentParty" party
          WHERE party."fulfillmentRequestId" = request."id" AND party."userId" = ${userId}
        )
        OR EXISTS (
          SELECT 1 FROM "Vehicle" vehicle
          WHERE vehicle."id" = request."vehicleId" AND vehicle."ownerId" = ${userId}
        )
        OR EXISTS (
          SELECT 1 FROM "Listing" listing
          WHERE listing."id" = request."listingId" AND listing."sellerId" = ${userId}
        )
    ), classified AS (
      SELECT accessible.*,
        EXISTS (
          SELECT 1 FROM "Vehicle" vehicle
          WHERE vehicle."id" = accessible."vehicleId" AND vehicle."ownerId" = ${userId}
        ) OR EXISTS (
          SELECT 1 FROM "Listing" listing
          WHERE listing."id" = accessible."listingId" AND listing."sellerId" = ${userId}
        ) AS is_owner
      FROM accessible
    )
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "status" IN ('SENT', 'VIEWED', 'ACCEPTED', 'READY_TO_SEND'))::bigint AS active,
      COUNT(*) FILTER (WHERE "status" IN ('DECLINED', 'EXPIRED', 'FAILED') OR "paymentStatus" = 'FAILED')::bigint AS attention,
      COALESCE(SUM("collectedAmount"), 0)::double precision AS captured,
      COUNT(*) FILTER (WHERE "requestType" = 'DEALER_PURCHASE' AND NOT is_owner)::bigint AS buying,
      COUNT(*) FILTER (WHERE "requestType" = 'DEALER_PURCHASE' AND is_owner)::bigint AS selling,
      COUNT(*) FILTER (WHERE "requestType" = 'SERVICE_BOOKING')::bigint AS service,
      COUNT(*) FILTER (WHERE "requestType" = 'INSURANCE_QUOTE')::bigint AS insurance,
      COUNT(*) FILTER (WHERE "requestType" = 'TRANSPORT_QUOTE')::bigint AS transport
    FROM classified
  `);

  return {
    total: Number(summary?.total ?? 0),
    active: Number(summary?.active ?? 0),
    attention: Number(summary?.attention ?? 0),
    captured: summary?.captured ?? 0,
    tabCounts: {
      ALL: Number(summary?.total ?? 0),
      BUYING: Number(summary?.buying ?? 0),
      SELLING: Number(summary?.selling ?? 0),
      SERVICE_BOOKINGS: Number(summary?.service ?? 0),
      INSURANCE_REQUESTS: Number(summary?.insurance ?? 0),
      TRANSPORT_REQUESTS: Number(summary?.transport ?? 0),
    } satisfies Record<UserFulfillmentCategory, number>,
  };
}

/**
 * Returns role-scoped view for /transactions/[id] or /transactions/[publicToken].
 * Roles:
 * - BUYER: sees buyer info, vehicle specs, package status, fees, deposit hold, and next steps timeline.
 * - SELLER / OWNER: sees vehicle specs, buyer request summary, and transaction status (excludes buyer profile history and partner decision tokens).
 * - ADMIN: sees the buyer-style transaction view for operations QA/review.
 */
export async function getFulfillmentByIdForUser(idOrToken: string, userId?: string, userRole?: string | null) {
  const req = await prisma.fulfillmentRequest.findFirst({
    where: {
      OR: [{ id: idOrToken }, { publicTransactionToken: idOrToken }],
    },
    select: transactionDetailRequestSelect,
  });

  if (!req) {
    return { error: "NOT_FOUND", message: "Transaction record not found." };
  }

  if (!userId) {
    return { error: "UNAUTHORIZED", message: "Please sign in to view this transaction." };
  }

  const isAdmin = userRole === "ADMIN";

  // Determine user role (BUYER vs SELLER/OWNER)
  const isSellerOrOwner =
    req.vehicle?.ownerId === userId ||
      req.listing?.sellerId === userId ||
      req.parties.some((p) => p.userId === userId && (p.partyType === "SELLER" || p.partyType === "DEALER"));

  const isBuyer =
    req.buyerId === userId ||
    req.parties.some((p) => p.userId === userId && p.partyType === "BUYER");

  if (!isAdmin && !isBuyer && !isSellerOrOwner) {
    return { error: "FORBIDDEN", message: "You do not have access to this transaction." };
  }

  const role: "BUYER" | "SELLER" | "ADMIN" = isAdmin ? "ADMIN" : isSellerOrOwner ? "SELLER" : "BUYER";

  // Parse package scope
  const primaryPackage = req.packages[0];
  const userFacingEvents = sanitizeUserFacingEvents([...req.events].reverse());
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
        expectedPlatformFee: Number(req.expectedPlatformFee),
        expectedPartnerCommission: Number(req.expectedPartnerCommission),
        collectedAmount: Number(req.collectedAmount),
        refundableAmount: Number(req.refundableAmount),
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
              amount: Number(req.depositIntents[0].amount),
              currency: req.depositIntents[0].currency,
              status: req.depositIntents[0].status,
            }
          : null,
        events: userFacingEvents,
      },
    };
  }

  // Buyer/Admin Scoped View:
  // Includes full buyer info, vehicle specs, package status, fees, deposit hold, and timeline next steps.
  return {
    success: true,
    role,
    request: {
      id: req.id,
      publicTransactionToken: req.publicTransactionToken,
      requestType: req.requestType,
      status: req.status,
      paymentStatus: req.paymentStatus,
      expectedPlatformFee: Number(req.expectedPlatformFee),
      expectedPartnerCommission: Number(req.expectedPartnerCommission),
      collectedAmount: Number(req.collectedAmount),
      refundableAmount: Number(req.refundableAmount),
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
      fees: req.fees.map((fee) => ({ ...fee, amount: Number(fee.amount) })),
      depositIntents: req.depositIntents.map((deposit) => ({
        ...deposit,
        amount: Number(deposit.amount),
      })),
      events: userFacingEvents,
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
        amount: Number(fee.amount),
        currency: fee.currency,
        description: fee.description || undefined,
        status,
      };
    }),
    depositIntent: original.depositIntents[0]
      ? {
          amount: Number(original.depositIntents[0].amount),
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
    select: cancellationFulfillmentRequestSelect,
  });

  if (!req) {
    throw new Error(`FulfillmentRequest not found: ${params.fulfillmentRequestId}`);
  }

  if (["DECLINED", "EXPIRED", "CANCELLED", "COMPLETED"].includes(req.status)) {
    return { success: false, message: `Request is already in '${req.status}' state.` };
  }

  const isPreAcceptance = req.status !== "ACCEPTED";
  const previousStatus = req.status;
  const originalDeposit = Number(req.depositIntents[0]?.amount || req.collectedAmount || 0);
  const { policyFee, refundAmount } = getCancellationSettlement(originalDeposit);

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
          const amountToRefund = Math.min(Number(deposit.amount), remainingRefundAmount);
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

export async function cancelConfirmedServiceBookingByPartner(token: string) {
  const tokenRecord = await prisma.partnerDecisionToken.findUnique({
    where: { token },
    select: partnerServiceCancellationTokenSelect,
  });

  if (!tokenRecord) {
    return { success: false, message: "Fulfillment token not found." };
  }

  const req = tokenRecord.fulfillmentRequest;
  if (req.requestType !== "SERVICE_BOOKING") {
    return { success: false, message: "Only service bookings can be cancelled from this partner flow." };
  }

  if (tokenRecord.actionTaken !== "ACCEPTED") {
    return { success: false, message: "Only the accepting service partner can cancel this appointment." };
  }

  if (req.status === "CANCELLED" || req.paymentStatus === "REFUNDED") {
    return { success: true, message: "Service booking is already cancelled and refunded." };
  }

  if (req.status !== "CONFIRMED" || req.paymentStatus !== "PAID") {
    return { success: false, message: "Service booking can only be refunded after payment is confirmed." };
  }

  const capturedDeposits = req.depositIntents.filter((deposit) => deposit.status === "CAPTURED");
  try {
    for (const deposit of capturedDeposits) {
      await refundDeposit(deposit.transactionRef || "", Number(deposit.amount));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund failed.";
    await prisma.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus: req.status,
        newStatus: req.status,
        actorType: "PARTNER",
        actorId: tokenRecord.partnerName || "PARTNER",
        note: `Partner cancellation refund failed before finalization: ${message}`,
      },
    });
    return { success: false, message: `Refund failed: ${message}` };
  }

  const refundedAmount = capturedDeposits.reduce((sum, deposit) => sum + Number(deposit.amount), 0);
  const cancellationReason = `Service partner '${tokenRecord.partnerName || "Service partner"}' cancelled confirmed appointment and refunded the booking fee.`;

  await prisma.$transaction(async (tx) => {
    for (const deposit of capturedDeposits) {
      await tx.depositIntent.update({
        where: { id: deposit.id },
        data: { status: "REFUNDED", releasedAt: new Date() },
      });
    }

    for (const fee of req.fees.filter((fee) => fee.feeType === "SERVICE_FEE")) {
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
        refundableAmount: 0,
        collectedAmount: 0,
        cancellationReason,
        cancelledByActor: "PARTNER",
        payoutStatus: "UNSETTLED",
      },
    });

    await tx.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: req.id,
        previousStatus: req.status,
        newStatus: "CANCELLED",
        actorType: "PARTNER",
        actorId: tokenRecord.partnerName || "PARTNER",
        note: cancellationReason,
        metadata: JSON.stringify({
          tokenId: tokenRecord.id,
          partnerEmail: tokenRecord.partnerEmail || null,
          refundedAmount,
        }),
      },
    });
  });

  const buyerParty = req.parties.find((party) => party.partyType === "BUYER");
  if (buyerParty?.email) {
    const vehicleSummary = req.vehicle
      ? `${req.vehicle.year} ${req.vehicle.model.make.name} ${req.vehicle.model.name} (VIN: ${req.vehicle.vin})`
      : "Service Booking";

    await sendFulfillmentEmail({
      fulfillmentRequestId: req.id,
      templateType: "CANCELLATION_REFUND_NOTIFICATION",
      recipientName: buyerParty.name,
      recipientEmail: buyerParty.email,
      packageTitle: "Service booking cancelled and refunded",
      vehicleSummary,
      priceOrAmount: refundedAmount,
      reviewUrl: `/fulfillment/buyer/${req.publicTransactionToken}`,
      additionalDetails: {
        "Cancelled By": tokenRecord.partnerName || "Service partner",
        "Refund Status": "REFUNDED",
      },
    });
  }

  return { success: true, message: "Service booking cancelled and refunded." };
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
    select: expirePartnerDecisionTokenSelect,
    orderBy: { expiresAt: "asc" },
    take: 100,
  });

  let count = 0;
  for (const tokenRecord of expiredTokens) {
    const req = tokenRecord.fulfillmentRequest;
    if (!req) continue;

    const expiration = await expirePartnerDecisionToken(tokenRecord.id, tokenRecord);
    if (!expiration.processed) continue;

    const buyerParty = req.parties[0];
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

async function expirePartnerDecisionToken(
  tokenId: string,
  existingTokenRecord?: ExpirePartnerDecisionTokenRecord,
) {
  const tokenRecord = existingTokenRecord ?? await prisma.partnerDecisionToken.findUnique({
      where: { id: tokenId },
      select: expirePartnerDecisionTokenSelect,
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
