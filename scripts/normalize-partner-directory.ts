/**
 * scripts/normalize-partner-directory.ts
 *
 * Normalizes active PartnerContact display fields so directory data stays clean:
 * - Location is stored as City, ST
 * - City does not contain street address, state, or ZIP
 * - State is a two-letter code
 * - US phone numbers are formatted consistently
 *
 * Usage:
 *   npm run normalize-partner-directory
 *   npm run normalize-partner-directory -- --dry-run
 */

import { prisma } from "../lib/prisma";
import { normalizePartnerLocation, normalizePhoneNumber } from "../lib/directory/partner-contact-format";
import { getBatchLimit, hasArg, isExecuteMode, logScriptMode } from "./lib/script-guards";

async function main() {
  const execute = isExecuteMode() && !hasArg("--dry-run");
  const limit = getBatchLimit({ defaultLimit: 150, maxLimit: 1000 });
  logScriptMode("normalize-partner-directory", execute, limit);
  const contacts = await prisma.partnerContact.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      location: true,
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: limit,
  });

  let updated = 0;
  let unchanged = 0;

  console.log("==================================================");
  console.log("  SUPERCAR DASH Partner Directory Normalize");
  console.log("==================================================");
  console.log(`Mode: ${execute ? "update rows" : "dry run"}`);
  console.log(`Contacts: ${contacts.length}\n`);

  for (const contact of contacts) {
    const location = normalizePartnerLocation(contact);
    const phone = normalizePhoneNumber(contact.phone);
    const data: Record<string, string | null | Date> = {};

    setIfChanged(data, "phone", contact.phone, phone);
    setIfChanged(data, "streetAddress", contact.streetAddress, location.streetAddress);
    setIfChanged(data, "city", contact.city, location.city);
    setIfChanged(data, "state", contact.state, location.state);
    setIfChanged(data, "postalCode", contact.postalCode, location.postalCode);
    setIfChanged(data, "location", contact.location, location.location);

    if (Object.keys(data).length === 0) {
      unchanged++;
      continue;
    }

    data.lastVerifiedAt = new Date();
    updated++;
    console.log(`${execute ? "UPDT" : "DRY "} ${contact.type} | ${contact.name} | ${Object.keys(data).join(", ")}`);

    if (execute) {
      await prisma.partnerContact.update({
        where: { id: contact.id },
        data,
      });
    }
  }

  console.log("\n==================================================");
  console.log(`  Updated:   ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log("==================================================");
}

function setIfChanged(
  data: Record<string, string | null | Date>,
  key: string,
  current: string | null,
  next: string | null,
) {
  if ((current || null) !== (next || null)) {
    data[key] = next;
  }
}

main()
  .catch((error) => {
    console.error("Partner directory normalization failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
