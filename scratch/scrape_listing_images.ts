import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.listing.findMany({
    where: {
      OR: [{ imageUrl: null }, { imageUrl: "" }],
      url: { not: null, startsWith: "http" }
    },
    take: 10
  });

  console.log(`Found ${listings.length} listings to process (testing first 10).`);
  let updatedCount = 0;

  for (const listing of listings) {
    if (!listing.url) continue;
    try {
      const res = await fetch(listing.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) {
        console.log(`Failed to fetch ${listing.url} (Status: ${res.status})`);
        continue;
      }
      const html = await res.text();
      
      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) || 
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i) ||
                      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      
      let imageUrl = ogMatch ? ogMatch[1] : null;

      if (!imageUrl) {
        const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
        for (const match of imgMatches) {
          const src = match[1];
          if (src.includes("placeholder") || src.includes("logo") || src.includes("avatar")) continue;
          if (src.endsWith(".jpg") || src.endsWith(".jpeg") || src.endsWith(".png") || src.endsWith(".webp")) {
             imageUrl = src;
             if (!imageUrl.startsWith("http")) {
                const urlObj = new URL(listing.url);
                imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
             }
             break;
          }
        }
      }

      if (imageUrl) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { imageUrl }
        });
        console.log(`Updated ${listing.id} with image ${imageUrl}`);
        updatedCount++;
      } else {
        console.log(`No image found for ${listing.url}`);
      }
    } catch (e: any) {
      console.log(`Error processing ${listing.url}: ${e.message}`);
    }
  }

  console.log(`Successfully updated ${updatedCount} listings.`);
}

main().finally(() => prisma.$disconnect());
