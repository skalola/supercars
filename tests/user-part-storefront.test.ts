import test from "node:test";
import assert from "node:assert/strict";

import { paginateStorefrontOffers, prioritizeStorefrontOffers } from "../lib/parts/user-part-storefront";

test("qualified owner listings rank after direct suppliers and before eBay fallback", () => {
  const offers = prioritizeStorefrontOffers(
    [
      { id: "ebay", provider: "EBAY" },
      { id: "manufacturer", provider: "DIRECT_MANUFACTURER" },
      { id: "retailer", provider: "AUTHORIZED_RETAILER" },
    ],
    [{ id: "owner", provider: "GARAGE_OWNER", offerKind: "USER_LISTING" }],
  );

  assert.deepEqual(offers.map((offer) => offer.id), ["manufacturer", "retailer", "owner", "ebay"]);
});

test("exact vehicle owner listings rank ahead of universal owner listings", () => {
  const offers = prioritizeStorefrontOffers(
    [{ id: "ebay", provider: "EBAY" }],
    [
      { id: "universal", provider: "GARAGE_OWNER", offerKind: "USER_LISTING", fitmentConfidence: "UNIVERSAL" },
      { id: "exact-model", provider: "GARAGE_OWNER", offerKind: "USER_LISTING", fitmentConfidence: "SELLER_DECLARED_EXACT_MODEL" },
      { id: "exact-variant", provider: "GARAGE_OWNER", offerKind: "USER_LISTING", fitmentConfidence: "SELLER_DECLARED_EXACT_VARIANT" },
    ],
  );

  assert.deepEqual(offers.map((offer) => offer.id), ["exact-variant", "exact-model", "universal", "ebay"]);
});

test("ranking preserves recency within the same owner fitment confidence", () => {
  const offers = prioritizeStorefrontOffers([], [
    { id: "newest", provider: "GARAGE_OWNER", fitmentConfidence: "SELLER_DECLARED_EXACT_MODEL" },
    { id: "older", provider: "GARAGE_OWNER", fitmentConfidence: "SELLER_DECLARED_EXACT_MODEL" },
  ]);

  assert.deepEqual(offers.map((offer) => offer.id), ["newest", "older"]);
});

test("combined storefront pagination does not repeat or skip owner and fallback offers", () => {
  const ordered = ["direct", "owner-1", "owner-2", "ebay-1", "ebay-2", "ebay-3"];
  const first = paginateStorefrontOffers(ordered, 1, 5);
  const second = paginateStorefrontOffers(ordered, 2, 5);

  assert.deepEqual(first.items, ["direct", "owner-1", "owner-2", "ebay-1", "ebay-2"]);
  assert.deepEqual(second.items, ["ebay-3"]);
  assert.equal(first.pagination.hasMore, true);
  assert.equal(second.pagination.hasPrevious, true);
  assert.equal(second.pagination.hasMore, false);
  assert.equal(second.pagination.total, 6);
});
