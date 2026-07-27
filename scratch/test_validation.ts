import { prisma } from "../lib/prisma";
import { ingestCrawlerListings } from "../lib/market-crawlers/crawler-engine";
import { getVehicleHeroImage } from "../lib/vehicle-images";

async function runTest() {
  console.log("=== Starting Sprint 6.12 Validation Test ===");

  const testVin = "ZHWUC1ZM4SLA02382"; // Decodes to a 2025 Lamborghini Revuelto

  // Clean up any existing records for this VIN to ensure a clean test run
  await prisma.vehicleImage.deleteMany({
    where: { vehicle: { vin: testVin } },
  });
  await prisma.listing.deleteMany({
    where: { vehicle: { vin: testVin } },
  });
  await prisma.vinDiscoverySource.deleteMany({
    where: { discovery: { vin: testVin } },
  });
  await prisma.vinDiscovery.deleteMany({
    where: { vin: testVin },
  });
  await prisma.vehicle.deleteMany({
    where: { vin: testVin },
  });

  console.log("Database cleaned for test VIN:", testVin);

  // Mismatched Listing Input (Reports Urus, but VIN is Revuelto)
  const mockListing: any = {
    sourceName: "DuPont Registry Test",
    sourceType: "MARKETPLACE",
    sourceKey: "dupont",
    pageUrl: "https://www.dupontregistry.com/autos/results/lamborghini",
    url: "https://www.dupontregistry.com/car/lamborghini/urus/2022/ZHWUC1ZM4SLA02382/99999",
    externalListingId: "99999",
    title: "2022 Lamborghini Urus",
    vin: testVin,
    year: 2022,
    make: "Lamborghini",
    model: "Urus",
    trim: null,
    price: 350000,
    mileage: 5000,
    color: "Giallo",
    location: "Miami, FL",
    dealerName: "Miami Exotic Cars",
    images: ["https://example.com/urus-front.jpg", "https://example.com/urus-rear.jpg"],
  };

  console.log("\nIngesting mismatched listing...");
  const results = await ingestCrawlerListings([mockListing]);
  console.log("Ingestion results:", results);

  // 1. Check validation fields on the Listing
  const dbListing = await prisma.listing.findFirst({
    where: { externalListingId: "99999" },
    include: {
      vehicle: {
        include: {
          model: {
            include: { make: true },
          },
        },
      },
      model: {
        include: { make: true },
      },
    },
  });

  if (!dbListing) {
    throw new Error("Listing was not ingested!");
  }

  console.log("\n=== Verifying Ingested Listing ===");
  console.log(`- Title / Model matched: ${dbListing.model.name} (${dbListing.model.make.name})`);
  console.log(`- Year:                  ${dbListing.year}`);
  console.log(`- vinVerified:           ${dbListing.vinVerified}`);
  console.log(`- validationStatus:      ${dbListing.validationStatus}`);

  // Assertions for Mismatch Correcting
  if (dbListing.validationStatus !== "MODEL_MISMATCH") {
    throw new Error(`Expected validationStatus to be MODEL_MISMATCH but got ${dbListing.validationStatus}`);
  }
  if (!dbListing.vinVerified) {
    throw new Error("Expected vinVerified to be true");
  }
  if (dbListing.model.name !== "Revuelto") {
    throw new Error(`Expected listing model to be corrected to Revuelto, but got ${dbListing.model.name}`);
  }
  if (dbListing.year !== 2025) {
    throw new Error(`Expected listing year to be corrected to 2025, but got ${dbListing.year}`);
  }
  console.log("✅ Listing identity corrected and marked successfully!");

  // 2. Check validation status on VehicleImage records
  const dbImages = await prisma.vehicleImage.findMany({
    where: { vehicleId: dbListing.vehicleId as string },
  });

  console.log("\n=== Verifying Vehicle Images ===");
  console.log(`- Total images attached: ${dbImages.length}`);
  for (const img of dbImages) {
    console.log(`  - URL: ${img.url} | validationStatus: ${img.validationStatus}`);
    if (img.validationStatus !== "IMAGE_UNVERIFIED") {
      throw new Error(`Expected image validationStatus to be IMAGE_UNVERIFIED, but got ${img.validationStatus}`);
    }
  }
  console.log("✅ Images marked as IMAGE_UNVERIFIED successfully!");

  // 3. Test getVehicleHeroImage resolver
  const fullVehicle = await prisma.vehicle.findUnique({
    where: { vin: testVin },
    include: {
      images: true,
      photos: true,
      model: {
        include: {
          images: true,
        },
      },
    },
  });

  if (!fullVehicle) {
    throw new Error("Vehicle was not created/found in DB!");
  }

  console.log("\n=== Testing Hero Image Resolver ===");
  const resolvedHero = getVehicleHeroImage(fullVehicle);
  console.log("- Resolved Hero Image:", resolvedHero);

  if (resolvedHero.includes("urus-front.jpg") || resolvedHero.includes("urus-rear.jpg")) {
    throw new Error("Hero image resolver selected an unverified listing image!");
  }
  console.log("✅ Hero image resolver correctly ignored unverified listing images!");

  console.log("\n=== All validation assertions passed! ===");
}

runTest()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Test failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
