import { readFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

async function source(path: string) {
  return readFile(join(root, path), "utf8");
}

async function main() {
  const [scriptSource, packageSource, adminSource, transactionSource, serviceSource] = await Promise.all([
    source("scripts/seed-fulfillment-demo.ts"),
    source("package.json"),
    source("components/admin/AdminOpsCenterClient.tsx"),
    source("app/transactions/[id]/page.tsx"),
    source("lib/fulfillment/service.ts"),
  ]);

  assert.match(scriptSource, /SPRINT9B_TEST_FIXTURE/, "seed script must tag repeatable 9B fixtures");
  assert.match(scriptSource, /cleanupOldFixtureRequests/, "seed script must clean old QA/demo requests");
  assert.match(scriptSource, /NODE_ENV === "production"/, "cleanup must refuse to run in production");
  assert.match(scriptSource, /deleteMany\(\{\s*where:\s*\{\}/, "cleanup should reset local fulfillment requests");
  assert.match(scriptSource, /user@supercars\.test/, "seed script must create the regular user test account");
  assert.match(scriptSource, /executePartnerDecisionByAction/, "seed script should exercise production partner decision flow");
  assert.match(scriptSource, /DEALER_PURCHASE/, "dealer purchase fixture must be seeded");
  assert.match(scriptSource, /INSURANCE_QUOTE/, "insurance quote fixture must be seeded");
  assert.match(scriptSource, /TRANSPORT_QUOTE/, "transport quote fixture must be seeded");
  assert.match(scriptSource, /SERVICE_BOOKING/, "service booking fixture must be seeded");

  assert.match(packageSource, /"seed-test-transactions"/, "package.json must expose the 9B seed command");
  assert.match(adminSource, /Buyer \/ Owner Hub/, "admin dashboard should label scoped transaction links clearly");
  assert.match(transactionSource, /session\?\.user\?\.role/, "transaction page must pass the session role into access scoping");
  assert.match(transactionSource, /Admin view/, "transaction page must support an admin view label");
  assert.match(transactionSource, /You do not have access to this transaction/, "transaction error state should distinguish forbidden access");
  assert.match(transactionSource, /Sign in to view this transaction/, "transaction error state should distinguish unauthenticated access");
  assert.match(serviceSource, /userRole\?: string \| null/, "transaction access service should receive session role");
  assert.match(serviceSource, /const isAdmin = userRole === "ADMIN"/, "transaction access service should permit admin review");
  assert.match(serviceSource, /!isAdmin && !isBuyer && !isSellerOrOwner/, "admin must bypass buyer/owner access checks without weakening outsider checks");

  console.log("Sprint 9B test transaction fixture checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
