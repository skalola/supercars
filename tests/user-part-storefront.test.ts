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
