/**
 * scripts/verify-partner-websites.ts
 *
 * Checks active PartnerContact website URLs without mutating data.
 *
 * Usage:
 *   npm run verify-partner-websites
 */

import { prisma } from "../lib/prisma";
import { getBatchLimit, logScriptMode } from "./lib/script-guards";

async function main() {
  const limit = getBatchLimit({ defaultLimit: 100, maxLimit: 500 });
  logScriptMode("verify-partner-websites", false, limit);
  const contacts = await prisma.partnerContact.findMany({
    where: {
      active: true,
      website: { not: null },
    },
    select: {
      name: true,
      type: true,
      website: true,
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    take: limit,
  });

  console.log(`Checking ${contacts.length} partner websites...`);

  for (const contact of contacts) {
    const result = await checkUrl(contact.website!);
    console.log(`${result.ok ? "OK  " : "WARN"} ${contact.type} | ${contact.name} | ${result.status || "ERR"} | ${contact.website}`);
  }
}

async function checkUrl(url: string) {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (head.ok || head.status === 405 || head.status === 403) {
      return { ok: head.ok || head.status === 405 || head.status === 403, status: head.status };
    }

    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    return { ok: get.ok || get.status === 405 || get.status === 403, status: get.status };
  } catch {
    return { ok: false, status: null };
  }
}

main()
  .catch((error) => {
    console.error("Partner website verification failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
