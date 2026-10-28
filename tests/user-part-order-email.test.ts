import assert from "node:assert/strict";
import test from "node:test";
import { buildUserPartOrderNotice } from "../lib/mail/user-part-order-template";

test("user part notices link recipients to the scoped transaction page", () => {
  const notice = buildUserPartOrderNotice({
    heading: "Payment confirmed",
    message: "Open your order for the next step.",
    orderId: "order-123",
  }, "https://supercardash.com/");

  assert.equal(notice.orderUrl, "https://supercardash.com/parts/orders/order-123");
  assert.match(notice.text, /View transaction: https:\/\/supercardash\.com\/parts\/orders\/order-123/);
  assert.match(notice.html, /href="https:\/\/supercardash\.com\/parts\/orders\/order-123"/);
});

test("user supplied notice copy is escaped in HTML while remaining readable in text", () => {
  const notice = buildUserPartOrderNotice({
    heading: "Buyer <Seller>",
    message: "Part & payment update",
    orderId: "order-456",
  }, "https://supercardash.com");

  assert.match(notice.html, /Buyer &lt;Seller&gt;/);
  assert.match(notice.html, /Part &amp; payment update/);
  assert.match(notice.text, /Buyer <Seller>/);
});
