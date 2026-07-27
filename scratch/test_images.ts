import { prisma } from "../lib/prisma";
import { getVehicleHeroImage } from "../lib/vehicle-images";

async function main() {
  console.log("=== Testing Vehicle Image Resolution (Sprint 6.10) ===");

  const vehicles = await prisma.vehicle.findMany({
    take: 10,
    include: {
      photos: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
      model: {
        include: {
          make: true,
          images: true,
        },
      },
    },
  });

  if (vehicles.length === 0) {
    console.log("No vehicles found in database to test!");
    return;
  }

  console.log(`Found ${vehicles.length} vehicles to verify:\n`);

  for (const v of vehicles) {
    const resolvedHero = getVehicleHeroImage(v);
    
    // Determine which priority was matched
    let matchType = "Priority 5: Generic Placeholder";
    
    if (v.photos && v.photos.length > 0) {
      const primaryPhoto = v.photos.find((p) => p.isHero) || v.photos[0];
      if (primaryPhoto?.filePath === resolvedHero) {
        matchType = `Priority 1: Owner Photo (${primaryPhoto.isHero ? "Primary" : "First Available"})`;
      }
    }
    
    if (matchType.startsWith("Priority 5")) {
      const primaryImg = v.images?.find((img) => img.isPrimary);
      if (primaryImg?.url === resolvedHero) {
        matchType = "Priority 2: Primary Marketplace Image";
      } else if (v.images && v.images.length > 0 && v.images[0].url === resolvedHero) {
        matchType = "Priority 3: First Available Listing Image";
      }
    }
    
    if (matchType.startsWith("Priority 5")) {
      const modelHero = v.model?.images?.find((img) => img.type === "hero") || v.model?.images?.[0];
      if (modelHero?.url === resolvedHero) {
        matchType = `Priority 4: Model Default (${modelHero.type === "hero" ? "Hero" : "First Available"})`;
      }
    }

    console.log(`Vehicle VIN: ${v.vin}`);
    console.log(`  Model: ${v.year} ${v.model.make.name} ${v.model.name}`);
    console.log(`  Owner Photos count: ${v.photos.length}`);
    console.log(`  Listing Images count: ${v.images.length}`);
    console.log(`  Model Images count: ${v.model?.images?.length || 0}`);
    console.log(`  Resolved Image: ${resolvedHero}`);
    console.log(`  Resolution path: \x1b[32m${matchType}\x1b[0m`);
    console.log("-----------------------------------------");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
  });
