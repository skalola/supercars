import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getFulfillmentByIdForUser } from "@/lib/fulfillment/service";

async function main() {
  const [admin, regularUser, fixtureRequest] = await Promise.all([
    prisma.user.findUnique({ where: { email: "admin@supercars.test" } }),
    prisma.user.findUnique({ where: { email: "user@supercars.test" } }),
    prisma.fulfillmentRequest.findFirst({
      where: { notes: { contains: "SPRINT9B_TEST_FIXTURE SERVICE_BOOKING" } },
      select: { publicTransactionToken: true },
    }),
  ]);

  assert.ok(admin, "Expected admin test user to exist");
  assert.equal(admin.role, "ADMIN", "Expected admin test user to have ADMIN role");
  assert.ok(regularUser, "Expected regular test user to exist");
  assert.ok(fixtureRequest, "Expected Sprint 9B service booking fixture to exist");

  const adminView = await getFulfillmentByIdForUser(
    fixtureRequest.publicTransactionToken,
    admin.id,
    admin.role
  );
  assert.equal("error" in adminView, false, "Admin should be allowed to open transaction URL");
  if (!("error" in adminView)) {
    assert.equal(adminView.role, "ADMIN", "Admin should receive admin-scoped transaction view");
    assert.equal(adminView.request.requestType, "SERVICE_BOOKING");
  }

  const userView = await getFulfillmentByIdForUser(
    fixtureRequest.publicTransactionToken,
    regularUser.id,
    regularUser.role
  );
  assert.equal("error" in userView, false, "Regular fixture user should still be allowed");

  const outsider = await prisma.user.upsert({
    where: { email: "outsider.9b@supercars.test" },
    update: { name: "Sprint 9B Outsider", role: "USER" },
    create: { email: "outsider.9b@supercars.test", name: "Sprint 9B Outsider", role: "USER" },
  });
  const outsiderView = await getFulfillmentByIdForUser(
    fixtureRequest.publicTransactionToken,
    outsider.id,
    outsider.role
  );
  assert.equal("error" in outsiderView, true, "Unrelated user should remain blocked");
  if ("error" in outsiderView) {
    assert.equal(outsiderView.error, "FORBIDDEN");
  }

  console.log("Sprint 9B admin transaction access checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
