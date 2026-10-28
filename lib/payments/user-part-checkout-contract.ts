import { getUserPartCheckoutKey } from "@/lib/payments/user-part-payment-policy";

export const USER_PART_CHECKOUT_RESERVATION_SECONDS = 30 * 60;

export type UserPartCheckoutContractInput = {
  orderId: string;
  listingTitle: string;
  itemAmountCents: number;
  shippingAmountCents: number;
  platformFeeCents: number;
  totalAmountCents: number;
  buyerId: string;
  buyerEmail: string | null;
  sellerId: string;
  listingId: string;
  collectShippingAddress: boolean;
  baseUrl: string;
};

export function buildUserPartCheckoutContract(input: UserPartCheckoutContractInput) {
  assertMoney(input.itemAmountCents, "item amount", true);
  assertMoney(input.shippingAmountCents, "shipping amount");
  assertMoney(input.platformFeeCents, "platform fee");
  assertMoney(input.totalAmountCents, "total amount", true);
  if (input.totalAmountCents !== input.itemAmountCents + input.shippingAmountCents) {
    throw new Error("Checkout total must equal item and shipping amounts.");
  }
  if (input.platformFeeCents > input.itemAmountCents) throw new Error("Platform fee cannot exceed the item amount.");

  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const body = new URLSearchParams();
  body.set("mode", "payment");
  // Stripe Checkout requires expires_at to be at least 30 minutes ahead.
  // Keeping the window at that minimum prevents abandoned checkouts from
  // removing an owner listing from purchasable inventory for a full day.
  body.set("expires_at", String(Math.floor(Date.now() / 1000) + USER_PART_CHECKOUT_RESERVATION_SECONDS));
  body.set("success_url", `${baseUrl}/parts/orders/${input.orderId}?payment=success`);
  body.set("cancel_url", `${baseUrl}/api/payments/user-part-checkout/cancel?orderId=${input.orderId}`);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(input.itemAmountCents));
  body.set("line_items[0][price_data][product_data][name]", input.listingTitle.slice(0, 120));
  if (input.shippingAmountCents > 0) {
    body.set("line_items[1][quantity]", "1");
    body.set("line_items[1][price_data][currency]", "usd");
    body.set("line_items[1][price_data][unit_amount]", String(input.shippingAmountCents));
    body.set("line_items[1][price_data][product_data][name]", "Shipping");
  }
  body.set("payment_intent_data[application_fee_amount]", String(input.platformFeeCents));
  if (input.collectShippingAddress) body.set("shipping_address_collection[allowed_countries][0]", "US");
  body.set("phone_number_collection[enabled]", "true");
  if (input.buyerEmail) body.set("customer_email", input.buyerEmail);

  const metadata = {
    userPartOrderId: input.orderId,
    userPartListingId: input.listingId,
    buyerUserId: input.buyerId,
    sellerUserId: input.sellerId,
    commerceType: "USER_PART_SALE",
  };
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
    body.set(`payment_intent_data[metadata][${key}]`, value);
  }

  return {
    body,
    idempotencyKey: getUserPartCheckoutKey(input.orderId, input.totalAmountCents),
  };
}

function assertMoney(value: number, label: string, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error(`A valid ${label} in cents is required.`);
  }
}
