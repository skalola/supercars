/**
 * lib/fulfillment/types.ts
 *
 * Core TypeScript definitions for Sprint 7.0 Fulfillment Infrastructure.
 */

export type FulfillmentRequestType =
  | "DEALER_PURCHASE"
  | "INSURANCE_QUOTE"
  | "TRANSPORT_QUOTE"
  | "SERVICE_BOOKING";

export type FulfillmentStatus =
  | "DRAFT"
  | "READY_TO_SEND"
  | "SENT"
  | "VIEWED"
  | "ACCEPTED"
  | "ACCEPTED_AWAITING_PAYMENT"
  | "PAYMENT_PROCESSING"
  | "CONFIRMED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "COMPLETED"
  | "SERVICE_COMPLETED"
  | "REFUNDED";

export type FulfillmentPartyType =
  | "BUYER"
  | "SELLER"
  | "DEALER"
  | "INSURANCE_CARRIER"
  | "TRANSPORT_PROVIDER"
  | "SERVICE_CENTER"
  | "PLATFORM";

export type FulfillmentFeeType =
  | "COMMISSION"
  | "SERVICE_FEE"
  | "TRANSPORT_FEE"
  | "REFERRAL_FEE"
  | "DEPOSIT";

export type DepositStatus =
  | "AUTHORIZED"
  | "HELD"
  | "CAPTURED"
  | "RELEASED"
  | "REFUNDED";

export type PaymentStatus =
  | "NOT_REQUIRED"
  | "AUTHORIZATION_PENDING"
  | "AUTHORIZED"
  | "CAPTURE_PENDING"
  | "CAPTURED"
  | "PAYMENT_REQUIRED"
  | "PROCESSING"
  | "PAID"
  | "REFUNDED"
  | "VOIDED"
  | "FAILED"
  | "CANCELLED";

export type PayoutStatus =
  | "UNSETTLED"
  | "PENDING_RECONCILIATION"
  | "RECONCILED"
  | "PAYOUT_COMPLETED";

export type FulfillmentActorType =
  | "BUYER"
  | "PARTNER"
  | "SYSTEM"
  | "ADMIN";

export interface FulfillmentPartyInput {
  partyType: FulfillmentPartyType;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address?: string;
  roleDescription?: string;
  userId?: string;
}

export interface FulfillmentFeeInput {
  feeType: FulfillmentFeeType;
  amount: number;
  currency?: string;
  description?: string;
  status?: "ESTIMATED" | "AUTHORIZED" | "CAPTURED" | "REFUNDED" | "WAIVED";
}

export interface DepositIntentInput {
  amount: number;
  currency?: string;
  paymentMethod?: string;
  transactionRef?: string;
  expiresAt?: Date;
}

export interface CreateFulfillmentRequestInput {
  requestType: FulfillmentRequestType;
  status?: FulfillmentStatus;
  buyerId?: string;
  vehicleId?: string;
  listingId?: string;
  purchaseId?: string;
  notes?: string;
  suppressBuyerConfirmation?: boolean;
  paymentStatus?: PaymentStatus;

  // Scoped Data Package for Partner
  packageTitle: string;
  packageDescription?: string;
  scopedPackageData: Record<string, unknown>;

  // Initial Parties
  parties?: FulfillmentPartyInput[];

  // Optional Fees & Deposit
  fees?: FulfillmentFeeInput[];
  depositIntent?: DepositIntentInput;

  // Partner Token configuration
  partnerName?: string | null;
  partnerEmail?: string | null;
  partnerExpiresInDays?: number;
  /** Optional explicit partner type for registry lookup (DEALER | INSURER | TRANSPORTER | SERVICE_SHOP) */
  partnerType?: "DEALER" | "INSURER" | "TRANSPORTER" | "SERVICE_SHOP";
  /** Optional MarketSource ID to link listing source directly to partner contact */
  partnerMarketSourceId?: string | null;
}

export interface PartnerDecisionInput {
  token: string;
  decision: "ACCEPTED" | "DECLINED";
  note?: string;
  auditContext?: PartnerDecisionAuditContext;
}

export interface PartnerDecisionAuditContext {
  requestMethod?: string;
  routePath?: string;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  contentType?: string;
  submittedVia?: "FORM" | "JSON" | "SERVICE";
}
