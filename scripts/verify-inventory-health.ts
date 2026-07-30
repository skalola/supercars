import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Starting inventory health verification...");
  
  // 1. Purge all existing AutoTrader listings
  const autoTraderListings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      url: { contains: "autotrader.com" }
    }
  });
  
  if (autoTraderListings.length > 0) {
    console.log(`Found ${autoTraderListings.length} AutoTrader listings. Marking them as REMOVED.`);
    const result = await prisma.listing.updateMany({
      where: {
        id: { in: autoTraderListings.map(l => l.id) }
      },
      data: { status: "REMOVED" }
    });
    console.log(`Removed ${result.count} AutoTrader listings.`);
  }

  // 2. Health check remaining active listings
  const activeListings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      url: { not: null }
    }
  });

  console.log(`Verifying ${activeListings.length} active listings for 404s...`);
  
  let removedCount = 0;
  const batchSize = 10; // small batch to avoid rate limiting
  
  for (let i = 0; i < activeListings.length; i += batchSize) {
    const batch = activeListings.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (listing) => {
      try {
        const res = await fetch(listing.url!, {
          method: "HEAD", // Fast check
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(5000)
        });
        
        // If the URL returns 404, we remove it
        if (res.status === 404 || res.status === 410) {
          console.log(`[404] Dead listing found: ${listing.url}`);
          await prisma.listing.update({
            where: { id: listing.id },
            data: { status: "REMOVED" }
          });
          removedCount++;
        }
      } catch (err: any) {
        // We only remove confirmed 404s. Timeout/SSL errors might just be bad connection, not necessarily 404.
        // So we ignore fetch errors for now to be safe.
      }
    }));
    
    if (i % 100 === 0 && i > 0) {
      console.log(`Processed ${i} / ${activeListings.length}... (Removed: ${removedCount})`);
    }
  }

  console.log(`\nHealth check complete! Identified and removed ${removedCount} dead listings (404/410).`);
}

main().finally(() => prisma.$disconnect());
