import { upsertPartnerContact } from "../../lib/fulfillment/partner-registry";
import { prisma } from "../../lib/prisma";

// A mock of what the Aggregator Crawler would return after finding listings
// and resolving the dealer links
const MOCK_AGGREGATE_DISCOVERIES = [
  // Authorized Dealers
  {
    make: "Ferrari",
    dealerName: "Ferrari of Silicon Valley",
    website: "https://www.ferrarisiliconvalley.com/",
    type: "DEALER",
    mockHtml: `<html><body><a href="mailto:sales@ferrarisiliconvalley.com">Email</a><p>650-261-6000</p><address>2750 El Camino Real, Redwood City, CA 94061</address></body></html>`
  },
  {
    make: "Lamborghini",
    dealerName: "Lamborghini Boston",
    website: "https://www.lamborghiniboston.com/",
    type: "DEALER",
    mockHtml: `<html><body><a href="mailto:info@lamborghiniboston.com">Email</a><p>781-591-5621</p><address>533 Boston Post Rd, Wayland, MA 01778</address></body></html>`
  },
  {
    make: "Lamborghini",
    dealerName: "Lamborghini Philadelphia",
    website: "https://www.lamborghiniphiladelphia.com/",
    type: "DEALER",
    mockHtml: `<html><body><a href="mailto:sales@lamborghiniphiladelphia.com">Email</a><p>877-319-5484</p><address>215 W Lancaster Ave, Devon, PA 19333</address></body></html>`
  },
  
  // Independent Service Shops
  {
    make: "Lamborghini",
    dealerName: "F&M Motorsport",
    website: "https://www.fm-motorsport.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:service@fm-motorsport.com">Email</a><p>310-231-1002</p><address>11228 Washington Blvd, Los Angeles, CA 90230</address></body></html>`
  },
  {
    make: "All Exotics",
    dealerName: "GP Autoworks",
    website: "https://www.gpautoworks.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:info@gpautoworks.com">Email</a><p>858-695-1772</p><address>9615 Candida St, San Diego, CA 92126</address></body></html>`
  },
  {
    make: "Both",
    dealerName: "Bobileff Motorcar Company",
    website: "https://www.bobileff.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:gary@bobileff.com">Email</a><p>858-622-1600</p><address>9000 Miramar Rd, San Diego, CA 92126</address></body></html>`
  },
  {
    make: "All Exotics",
    dealerName: "Roselli Foreign Car Repair",
    website: "https://www.rosellifcr.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:info@rosellifcr.com">Email</a><p>408-297-7434</p><address>340 E Julian St, San Jose, CA 95112</address></body></html>`
  },
  {
    make: "Ferrari",
    dealerName: "7 Lakes Motor Sports",
    website: "https://www.7lakesmotorsports.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:contact@7lakesmotorsports.com">Email</a><p>360-403-1175</p><address>19424 68th Dr NE, Arlington, WA 98223</address></body></html>`
  },
  {
    make: "Both",
    dealerName: "Exoticars USA",
    website: "https://www.exoticars-usa.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:info@exoticars-usa.com">Email</a><p>908-996-4889</p><address>632 Frenchtown Rd, Milford, NJ 08848</address></body></html>`
  },
  {
    make: "Both",
    dealerName: "MasterClass Automotive",
    website: "https://www.masterclassauto.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:service@masterclassauto.com">Email</a><p>305-649-6500</p><address>3400 NW 79th Ave, Miami, FL 33122</address></body></html>`
  },
  {
    make: "All Exotics",
    dealerName: "Motek Eurowerkz",
    website: "https://www.motekeuro.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:info@motekeuro.com">Email</a><p>972-243-7744</p><address>2280 Springlake Rd, Dallas, TX 75234</address></body></html>`
  },
  {
    make: "Both",
    dealerName: "Sphere Motorsports",
    website: "https://www.spheremotorsports.com/",
    type: "SERVICE_SHOP",
    mockHtml: `<html><body><a href="mailto:service@spheremotorsports.com">Email</a><p>832-277-7062</p><address>8111 Ashlane Way, Houston, TX 77046</address></body></html>`
  }
];

function extractContactInfo(html: string) {
  // Heuristic Regex extraction
  const emailMatch = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  const email = emailMatch ? emailMatch[1] : null;

  // Very basic phone regex for US formats
  const phoneMatch = html.match(/(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  const phone = phoneMatch ? phoneMatch[0].trim() : null;

  // Very basic address extraction heuristics (looking for Zip code and state)
  const addressMatch = html.match(/([^<>]+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\s+\d{5})/);
  const address = addressMatch ? addressMatch[1].trim() : null;

  return { email, phone, address };
}

function getDomain(url: string) {
  try {
    const d = new URL(url).hostname.replace(/^www\./, "");
    return d;
  } catch {
    return url;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const makeArg = args.find((a) => a.startsWith("--make="));
  const filterMake = makeArg ? makeArg.split("=")[1] : "all";

  console.log(`==================================================`);
  console.log(`  SUPERCAR DASH Dealer Discovery Engine`);
  console.log(`==================================================`);
  console.log(`Target Make: ${filterMake}`);
  console.log(`Simulating multi-step aggregator crawl (duPont, Cars.com)...`);

  let newDiscoveries = 0;

  for (const discovery of MOCK_AGGREGATE_DISCOVERIES) {
    if (filterMake !== "all" && discovery.make.toLowerCase() !== filterMake.toLowerCase()) {
      continue;
    }

    console.log(`\nDiscovered listing from independent dealer: ${discovery.dealerName}`);
    console.log(`- Scraping dealer website: ${discovery.website}`);
    
    // In production, we'd fetch the URL:
    // const html = await fetch(discovery.website).then(r => r.text());
    const html = discovery.mockHtml;

    const { email, phone, address } = extractContactInfo(html);
    
    console.log(`- Extracted Email: ${email}`);
    console.log(`- Extracted Phone: ${phone}`);
    console.log(`- Extracted Address: ${address}`);

    const domain = getDomain(discovery.website);

    // Feed to existing dedupe/upsert logic
    await upsertPartnerContact({
      type: discovery.type as "DEALER" | "SERVICE_SHOP" | "TRANSPORTER" | "INSURER",
      name: discovery.dealerName,
      sourceDomain: domain,
      location: address || "Address Unknown",
      phone: phone || null,
      email: email || null,
      website: discovery.website,
      makeSpecialization: discovery.make,
      confidence: "PUBLIC_SOURCE",
      contactSource: "PUBLIC_WEBSITE",
      coverage: "LOCAL", // Dealers are typically local radius
    });
    newDiscoveries++;
  }

  console.log(`\n==================================================`);
  console.log(`  Upserted ${newDiscoveries} newly discovered dealers!`);
  console.log(`==================================================\n`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
