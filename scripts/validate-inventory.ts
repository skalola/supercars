import { prisma } from "../lib/prisma";

async function main() {
  console.log("=== VIN Identity Validation Report (Sprint 6.12) ===");

  const listings = await prisma.listing.findMany({
    include: {
      vehicle: {
        include: {
          model: {
            include: { make: true },
          },
        },
      },
    },
  });

  let checked = 0;
  let valid = 0;
  let mismatches = 0;
  const affectedVins = new Set<string>();
  const mismatchDetails: Array<{ vin: string; id: string; url: string | null }> = [];

  for (const l of listings) {
    if (!l.vehicle) continue;
    checked++;

    if (l.validationStatus === "VALID") {
      valid++;
    } else if (l.validationStatus === "MODEL_MISMATCH") {
      mismatches++;
      affectedVins.add(l.vehicle.vin);
      mismatchDetails.push({
        vin: l.vehicle.vin,
        id: l.id,
        url: l.url,
      });
    }
  }

  console.log(`- listings checked: ${checked}`);
  console.log(`- valid listings:   ${valid}`);
  console.log(`- mismatches found: ${mismatches}`);
  console.log(`- affected VINs:    ${affectedVins.size > 0 ? Array.from(affectedVins).join(", ") : "None"}`);

  if (mismatchDetails.length > 0) {
    console.log("\nDetailed Mismatches:");
    for (const detail of mismatchDetails) {
      console.log(`  - VIN: ${detail.vin} | Listing: ${detail.id} | Link: ${detail.url || "N/A"}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
