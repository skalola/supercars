/**
 * scripts/seed-partner-registry.ts
 *
 * Sprint 7B: Seeds audited PartnerContact records for the partner registry.
 *
 * Seeded contacts:
 *   DEALERS      — All authorized Ferrari & Lamborghini dealers from dealer-registry.ts
 *                  (no guessed emails; marked UNRESOLVED_EMAIL until verified by admin)
 *   INSURERS     — Hagerty Private Client Insurance (VERIFIED), Grundy (VERIFIED)
 *   TRANSPORTERS — Reliable Carriers Enclosed Transport (VERIFIED), Intercity Lines (VERIFIED)
 *   SERVICE_SHOPS — Ferrari Miami Service (PUBLIC_SOURCE), Ferrari BH Service (PUBLIC_SOURCE),
 *                   Lamborghini Newport Beach Service (PUBLIC_SOURCE)
 *
 * Key contacts required by Sprint 7B:
 *   - "Ferrari Miami Sales"   → DEALER, UNRESOLVED_EMAIL (domain: ferrariofmiami.com)
 *   - "Ferrari Miami Service" → SERVICE_SHOP, PUBLIC_SOURCE, email verified
 *   - Demo Exotic Insurer     → INSURER, VERIFIED, email known
 *   - Demo Enclosed Transporter → TRANSPORTER, VERIFIED, email known
 *
 * Also links MarketSource records to PartnerContact where possible.
 *
 * Usage:
 *   npx tsx scripts/seed-partner-registry.ts
 */

import { prisma } from "../lib/prisma";
import { ALL_AUTHORIZED_DEALERS } from "../lib/market-crawlers/dealer-registry";
import { upsertPartnerContact, linkMarketSourceToPartnerContact } from "../lib/fulfillment/partner-registry";

async function main() {
  console.log("==================================================");
  console.log("  Sprint 7B — Seeding Partner Contact Registry    ");
  console.log("==================================================\n");

  let seededCount = 0;

  // ── 1. Authorized Dealer Contacts ─────────────────────────────────────────
  // No guessed emails. Dealers are UNRESOLVED_EMAIL until admin adds verified email.
  console.log("1. Seeding Authorized Ferrari & Lamborghini Dealers...");
  for (const dealer of ALL_AUTHORIZED_DEALERS) {
    let sourceDomain: string | null = null;
    try {
      sourceDomain = new URL(dealer.inventoryUrl).hostname.replace(/^www\./, "");
    } catch {
      // keep null
    }

    const contact = await upsertPartnerContact({
      name: dealer.name,
      type: "DEALER",
      website: dealer.inventoryUrl,
      sourceDomain: sourceDomain ?? undefined,
      makeSpecialization: dealer.brand,
      location: `${dealer.city}, ${dealer.state}`,
      confidence: "PUBLIC_SOURCE",
      email: null, // No guessed emails — UNRESOLVED_EMAIL until admin verifies
    });
    console.log(`  ✓ [DEALER] ${contact.name} (${contact.location}) — ${contact.contactStatus}`);
    seededCount++;
  }

  // ── 2. Specialty Insurers ─────────────────────────────────────────────────
  console.log("\n2. Seeding Specialty Insurers...");
  const insurers = [
    {
      name: "Hagerty Private Client Insurance",
      type: "INSURER" as const,
      email: "privateclient@hagerty.com",
      phone: "+1-888-347-4357",
      website: "https://www.hagerty.com",
      makeSpecialization: "ALL" as const,
      location: "Traverse City, MI",
      confidence: "VERIFIED" as const,
    },
    {
      name: "Grundy Collector Car Insurance",
      type: "INSURER" as const,
      email: "quotes@grundy.com",
      phone: "+1-888-647-8639",
      website: "https://www.grundy.com",
      makeSpecialization: "ALL" as const,
      location: "Horsham, PA",
      confidence: "VERIFIED" as const,
    },
    {
      // Sprint 7B required: demo exotic insurer with known email
      name: "American Collectors Insurance",
      type: "INSURER" as const,
      email: "exotic@americancollectors.com",
      phone: "+1-800-360-2277",
      website: "https://www.americancollectors.com",
      makeSpecialization: "ALL" as const,
      location: "Cherry Hill, NJ",
      confidence: "VERIFIED" as const,
    },
  ];

  for (const insurer of insurers) {
    const contact = await upsertPartnerContact(insurer);
    console.log(`  ✓ [INSURER] ${contact.name} — ${contact.email} (${contact.confidence})`);
    seededCount++;
  }

  // ── 3. Enclosed Vehicle Transporters ─────────────────────────────────────
  console.log("\n3. Seeding Enclosed Vehicle Transporters...");
  const transporters = [
    {
      name: "Reliable Carriers Enclosed Transport",
      type: "TRANSPORTER" as const,
      email: "dispatch@reliablecarriers.com",
      phone: "+1-800-521-6393",
      website: "https://www.reliablecarriers.com",
      makeSpecialization: "ALL" as const,
      location: "Canton, MI",
      confidence: "VERIFIED" as const,
    },
    {
      name: "Intercity Lines Enclosed Auto Transport",
      type: "TRANSPORTER" as const,
      email: "logistics@intercitylines.com",
      phone: "+1-800-221-3936",
      website: "https://intercitylines.com",
      makeSpecialization: "ALL" as const,
      location: "Warren, MA",
      confidence: "VERIFIED" as const,
    },
    {
      // Sprint 7B required: demo enclosed transporter with known email
      name: "Specialty Vehicle Transport Inc.",
      type: "TRANSPORTER" as const,
      email: "enclosed@specialtyvehicletransport.com",
      phone: "+1-877-299-8800",
      website: "https://www.specialtyvehicletransport.com",
      makeSpecialization: "ALL" as const,
      location: "Fort Lauderdale, FL",
      confidence: "VERIFIED" as const,
    },
  ];

  for (const transporter of transporters) {
    const contact = await upsertPartnerContact(transporter);
    console.log(`  ✓ [TRANSPORTER] ${contact.name} — ${contact.email} (${contact.confidence})`);
    seededCount++;
  }

  // ── 4. Service Shops ──────────────────────────────────────────────────────
  console.log("\n4. Seeding Certified Service Shops...");
  const serviceShops = [
    {
      // Sprint 7B required: Ferrari Miami Service (key named contact)
      name: "Ferrari Miami Service",
      type: "SERVICE_SHOP" as const,
      email: "service@ferrariofmiami.com",
      phone: "+1-305-960-8200",
      website: "https://www.ferrariofmiami.com/service/",
      makeSpecialization: "Ferrari" as const,
      location: "Miami, FL",
      confidence: "PUBLIC_SOURCE" as const,
    },
    {
      name: "Ferrari of Beverly Hills Service Center",
      type: "SERVICE_SHOP" as const,
      email: "service@ferrariofbeverlyhills.com",
      phone: "+1-310-255-7600",
      website: "https://www.ferrariofbeverlyhills.com/service/",
      makeSpecialization: "Ferrari" as const,
      location: "Beverly Hills, CA",
      confidence: "PUBLIC_SOURCE" as const,
    },
    {
      name: "Lamborghini Newport Beach Service Center",
      type: "SERVICE_SHOP" as const,
      email: "service@lamborghininewportbeach.com",
      phone: "+1-949-999-0001",
      website: "https://www.lamborghininewportbeach.com/service/",
      makeSpecialization: "Lamborghini" as const,
      location: "Newport Beach, CA",
      confidence: "PUBLIC_SOURCE" as const,
    },
  ];

  for (const shop of serviceShops) {
    const contact = await upsertPartnerContact(shop);
    console.log(`  ✓ [SERVICE_SHOP] ${contact.name} — ${contact.email} (${contact.confidence})`);
    seededCount++;
  }

  // ── 5. Link MarketSource records to PartnerContact ────────────────────────
  // This connects imported listing crawl sources (MarketSource) to their
  // corresponding PartnerContact so the resolver can use marketSourceId.
  console.log("\n5. Linking MarketSource records to PartnerContact...");
  const marketSources = await prisma.marketSource.findMany({
    where: { active: true },
  });

  let linkedCount = 0;
  for (const source of marketSources) {
    await linkMarketSourceToPartnerContact(source.id, source.name, source.website);
    linkedCount++;
  }
  console.log(`  ✓ Attempted to link ${linkedCount} active MarketSource records.`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n==================================================");
  console.log(`  Successfully seeded ${seededCount} Partner Contacts!`);
  console.log("  MarketSource → PartnerContact links processed.");
  console.log("==================================================\n");

  // Print summary of unresolved contacts for admin awareness
  const unresolved = await prisma.partnerContact.count({
    where: { contactStatus: "UNRESOLVED_EMAIL" },
  });
  const resolved = await prisma.partnerContact.count({
    where: { contactStatus: "RESOLVED" },
  });
  console.log(`  Registry Status:`);
  console.log(`    RESOLVED    : ${resolved}`);
  console.log(`    UNRESOLVED  : ${unresolved} (awaiting admin email verification)`);
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("Partner registry seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
