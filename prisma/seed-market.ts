/**
 * Sprint 5.2: Market Intelligence Seed
 * Run: npx tsx prisma/seed-market.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function d(s: string) { return new Date(s); }
function median(v: number[]) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

async function main() {
  console.log("🌱 Seeding market intelligence data...\n");

  // ── Market Sources ────────────────────────────────────────────────────────
  const [bat, rms, dupont, ferrariDealer, lamboDealer] = await Promise.all([
    prisma.marketSource.upsert({ where: { name: "Bring a Trailer" }, update: {}, create: { name: "Bring a Trailer", type: "AUCTION", website: "https://bringatrailer.com", active: true } }),
    prisma.marketSource.upsert({ where: { name: "RM Sotheby's" }, update: {}, create: { name: "RM Sotheby's", type: "AUCTION", website: "https://rmsothebys.com", active: true } }),
    prisma.marketSource.upsert({ where: { name: "DuPont Registry" }, update: {}, create: { name: "DuPont Registry", type: "MARKETPLACE", website: "https://dupontregistry.com", active: true } }),
    prisma.marketSource.upsert({ where: { name: "Ferrari Dealer Network" }, update: {}, create: { name: "Ferrari Dealer Network", type: "DEALER", website: "https://ferrari.com", active: true } }),
    prisma.marketSource.upsert({ where: { name: "Lamborghini Dealer Network" }, update: {}, create: { name: "Lamborghini Dealer Network", type: "DEALER", website: "https://lamborghini.com", active: true } }),
  ]);
  console.log("✅ Market sources seeded: 5");

  // ── Resolve Models ────────────────────────────────────────────────────────
  const ferrari = await prisma.make.findUnique({ where: { slug: "ferrari" } });
  const lamborghini = await prisma.make.findUnique({ where: { slug: "lamborghini" } });
  if (!ferrari || !lamborghini) throw new Error("Makes not found. Run main seed first.");

  const f458 = await prisma.model.findUnique({ where: { makeId_slug: { makeId: ferrari.id, slug: "458-italia" } } });
  const huracan = await prisma.model.findUnique({ where: { makeId_slug: { makeId: lamborghini.id, slug: "huracan" } } });
  if (!f458) throw new Error("458 Italia not found.");
  if (!huracan) throw new Error("Huracan not found.");
  console.log("✅ Models resolved:", f458.name, "&", huracan.name);

  // ── Listings ──────────────────────────────────────────────────────────────
  const f458Listings = [
    { year: 2013, price: 219000, mileage: 8400,  color: "Rosso Corsa",          location: "Beverly Hills, CA", dealerName: "Ferrari of Beverly Hills", sourceId: ferrariDealer.id },
    { year: 2014, price: 234500, mileage: 5100,  color: "Bianco Avus",           location: "Miami, FL",         dealerName: null,                        sourceId: dupont.id },
    { year: 2012, price: 204000, mileage: 14200, color: "Grigio Silverstone",     location: "New York, NY",      dealerName: null,                        sourceId: bat.id },
    { year: 2015, price: 245000, mileage: 3200,  color: "Nero Daytona",           location: "Dallas, TX",        dealerName: "Ferrari of Dallas",          sourceId: ferrariDealer.id },
    { year: 2013, price: 211000, mileage: 11500, color: "Giallo Triplo Strato",   location: "Chicago, IL",       dealerName: null,                        sourceId: dupont.id },
    { year: 2014, price: 228000, mileage: 7800,  color: "Azzurro Dino",           location: "Scottsdale, AZ",    dealerName: null,                        sourceId: bat.id },
  ];
  for (const l of f458Listings) {
    await prisma.listing.create({ data: { modelId: f458.id, status: "ACTIVE", firstSeen: d("2026-06-01"), lastSeen: d("2026-07-14"), ...l } });
  }

  const huracanListings = [
    { year: 2016, price: 189000, mileage: 12000, color: "Arancio Borealis",  location: "Los Angeles, CA",   dealerName: "Lamborghini Beverly Hills", sourceId: lamboDealer.id },
    { year: 2018, price: 219500, mileage: 7200,  color: "Bianco Monocerus",  location: "Miami, FL",          dealerName: null,                         sourceId: dupont.id },
    { year: 2017, price: 204000, mileage: 9400,  color: "Nero Aldebaran",     location: "New York, NY",       dealerName: null,                         sourceId: bat.id },
    { year: 2019, price: 238000, mileage: 4100,  color: "Verde Mantis",       location: "Dallas, TX",         dealerName: "Lamborghini Dallas",          sourceId: lamboDealer.id },
    { year: 2016, price: 178000, mileage: 18600, color: "Giallo Midas",       location: "Chicago, IL",        dealerName: null,                         sourceId: dupont.id },
    { year: 2018, price: 225000, mileage: 5900,  color: "Blu Nethuns",         location: "Seattle, WA",        dealerName: null,                         sourceId: bat.id },
  ];
  for (const l of huracanListings) {
    await prisma.listing.create({ data: { modelId: huracan.id, status: "ACTIVE", firstSeen: d("2026-06-01"), lastSeen: d("2026-07-14"), ...l } });
  }
  console.log(`✅ Listings seeded: ${f458Listings.length} Ferrari 458 + ${huracanListings.length} Huracán`);

  // ── Market Sales ──────────────────────────────────────────────────────────
  const f458Sales = [
    { saleDate: d("2025-11-15"), salePrice: 215000, year: 2013, mileage: 9200,  color: "Rosso Corsa",          location: "Scottsdale, AZ",    sourceId: rms.id },
    { saleDate: d("2025-12-08"), salePrice: 198000, year: 2012, mileage: 16300, color: "Bianco Avus",           location: "New York, NY",      sourceId: bat.id },
    { saleDate: d("2026-01-22"), salePrice: 226000, year: 2014, mileage: 6800,  color: "Nero Daytona",           location: "London, UK",        sourceId: rms.id },
    { saleDate: d("2026-02-14"), salePrice: 209500, year: 2013, mileage: 11000, color: "Grigio Silverstone",     location: "Beverly Hills, CA", sourceId: bat.id },
    { saleDate: d("2026-03-05"), salePrice: 231000, year: 2015, mileage: 4400,  color: "Rosso Corsa",           location: "Monte Carlo, MC",   sourceId: rms.id },
    { saleDate: d("2026-04-18"), salePrice: 218000, year: 2014, mileage: 8100,  color: "Azzurro Dino",           location: "Miami, FL",         sourceId: bat.id },
    { saleDate: d("2026-05-30"), salePrice: 222500, year: 2013, mileage: 9900,  color: "Bianco Avus",           location: "Chicago, IL",       sourceId: bat.id },
    { saleDate: d("2026-06-20"), salePrice: 237000, year: 2015, mileage: 3100,  color: "Giallo Triplo Strato",  location: "Dallas, TX",        sourceId: rms.id },
  ];
  for (const s of f458Sales) {
    await prisma.marketSale.create({ data: { modelId: f458.id, ...s } });
  }

  const huracanSales = [
    { saleDate: d("2025-11-20"), salePrice: 182000, year: 2016, mileage: 14200, color: "Arancio Borealis",  location: "Scottsdale, AZ",    sourceId: bat.id },
    { saleDate: d("2025-12-15"), salePrice: 196000, year: 2017, mileage: 10500, color: "Nero Aldebaran",    location: "Miami, FL",         sourceId: rms.id },
    { saleDate: d("2026-01-10"), salePrice: 174000, year: 2015, mileage: 21000, color: "Giallo Midas",      location: "Los Angeles, CA",   sourceId: bat.id },
    { saleDate: d("2026-02-08"), salePrice: 208000, year: 2018, mileage: 8300,  color: "Verde Mantis",      location: "New York, NY",      sourceId: rms.id },
    { saleDate: d("2026-03-22"), salePrice: 191000, year: 2017, mileage: 12000, color: "Bianco Monocerus",  location: "Chicago, IL",       sourceId: bat.id },
    { saleDate: d("2026-04-05"), salePrice: 215000, year: 2019, mileage: 5600,  color: "Blu Nethuns",       location: "Beverly Hills, CA", sourceId: rms.id },
    { saleDate: d("2026-05-12"), salePrice: 187500, year: 2016, mileage: 16800, color: "Arancio Borealis",  location: "Dallas, TX",        sourceId: bat.id },
    { saleDate: d("2026-06-28"), salePrice: 224000, year: 2019, mileage: 4200,  color: "Verde Mantis",      location: "London, UK",        sourceId: rms.id },
  ];
  for (const s of huracanSales) {
    await prisma.marketSale.create({ data: { modelId: huracan.id, ...s } });
  }
  console.log(`✅ Market sales seeded: ${f458Sales.length} Ferrari 458 + ${huracanSales.length} Huracán`);

  // ── Market Snapshots ──────────────────────────────────────────────────────
  async function snap(modelId: string, date: string, prices: number[], miles: number[], salesCount: number) {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const med = median(prices);
    return prisma.marketSnapshot.create({
      data: {
        modelId, date: d(date),
        activeListingCount: prices.length,
        averagePrice: Math.round(avg),
        medianPrice: Math.round(med),
        lowestPrice: Math.min(...prices),
        highestPrice: Math.max(...prices),
        salesCount,
        averageMileage: Math.round(miles.reduce((a, b) => a + b, 0) / miles.length),
      },
    });
  }

  // Ferrari 458 – Jan to Jul 2026
  await snap(f458.id, "2026-01-01", [210000,198000,222000,235000,205000],        [9200,16300,6800,3200,11000], 2);
  await snap(f458.id, "2026-02-01", [212000,201000,225000,237000,208000,196000], [9000,15800,6500,3000,10500,18000], 2);
  await snap(f458.id, "2026-03-01", [214000,203000,228000,240000,210000,199000], [8800,15200,6200,2900,10200,17200], 2);
  await snap(f458.id, "2026-04-01", [215000,205000,230000,242000,211000,200000], [8600,14800,6000,2800,9900,16800], 2);
  await snap(f458.id, "2026-05-01", [217000,207000,232000,244000,213000,202000], [8400,14400,5800,2700,9600,16400], 2);
  await snap(f458.id, "2026-06-01", [219000,234500,204000,245000,211000,228000], [8400,5100,14200,3200,11500,7800], 2);
  await snap(f458.id, "2026-07-01", [219000,234500,204000,245000,211000,228000], [8400,5100,14200,3200,11500,7800], 0);

  // Huracán – Jan to Jul 2026
  await snap(huracan.id, "2026-01-01", [185000,172000,205000,218000,192000],        [14200,22000,8300,4100,12000], 2);
  await snap(huracan.id, "2026-02-01", [187000,174000,207000,221000,194000,180000], [13800,21500,8000,3900,11500,19000], 2);
  await snap(huracan.id, "2026-03-01", [189000,176000,209000,224000,196000,182000], [13400,21000,7700,3700,11000,18500], 2);
  await snap(huracan.id, "2026-04-01", [191000,178000,211000,226000,198000,184000], [13000,20500,7400,3500,10500,18000], 2);
  await snap(huracan.id, "2026-05-01", [193000,180000,213000,229000,200000,186000], [12600,20000,7100,3300,10000,17500], 2);
  await snap(huracan.id, "2026-06-01", [189000,219500,204000,238000,178000,225000], [12000,7200,9400,4100,18600,5900], 2);
  await snap(huracan.id, "2026-07-01", [189000,219500,204000,238000,178000,225000], [12000,7200,9400,4100,18600,5900], 0);
  console.log("✅ Market snapshots seeded: 7 months × 2 models");

  // ── Final counts ──────────────────────────────────────────────────────────
  const [sc, lc, mc, snc] = await Promise.all([
    prisma.marketSource.count(),
    prisma.listing.count(),
    prisma.marketSale.count(),
    prisma.marketSnapshot.count(),
  ]);
  console.log("\n📊 Sprint 5.2 Seed Summary:");
  console.log(`   MarketSource:    ${sc}`);
  console.log(`   Listing:         ${lc}`);
  console.log(`   MarketSale:      ${mc}`);
  console.log(`   MarketSnapshot:  ${snc}`);
  console.log("\n✅ Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
