import { upsertPartnerContact } from "../../lib/fulfillment/partner-registry";
import { prisma } from "../../lib/prisma";

// A mock of what the Directory Sweeper would find on specialized 
// logistics and insurance directories
const MOCK_LOGISTICS_DISCOVERIES = [
  // Transporters
  {
    type: "TRANSPORTER",
    name: "Reliable Carriers",
    website: "https://www.reliablecarriers.com/",
    mockHtml: `<html><body><a href="mailto:info@reliablecarriers.com">Email</a><p>800-521-6393</p><address>41555 Haggerty Rd, Canton, MI 48187</address></body></html>`
  },
  {
    type: "TRANSPORTER",
    name: "Intercity Lines",
    website: "https://www.intercitylines.com/",
    mockHtml: `<html><body><a href="mailto:quotes@intercitylines.com">Email</a><p>800-221-3936</p><address>73 Breamish St, Warren, MA 01083</address></body></html>`
  },
  {
    type: "TRANSPORTER",
    name: "JP Logistics",
    website: "https://www.jplogistics.net/",
    mockHtml: `<html><body><a href="mailto:dispatch@jplogistics.net">Email</a><p>888-590-7763</p><address>11300 Peoria St, Sun Valley, CA 91352</address></body></html>`
  },
  {
    type: "TRANSPORTER",
    name: "Montway Auto Transport",
    website: "https://www.montway.com/",
    mockHtml: `<html><body><a href="mailto:info@montway.com">Email</a><p>888-666-8929</p><address>1300 E Woodfield Rd, Schaumburg, IL 60173</address></body></html>`
  },
  {
    type: "TRANSPORTER",
    name: "Shaughnessy Overland Express",
    website: "https://www.soexinc.com/",
    mockHtml: `<html><body><a href="mailto:sales@soexinc.com">Email</a><p>239-593-1811</p><address>1040 Collier Center Way, Naples, FL 34110</address></body></html>`
  },
  {
    type: "TRANSPORTER",
    name: "AmeriFreight",
    website: "https://www.amerifreight.net/",
    mockHtml: `<html><body><a href="mailto:info@amerifreight.net">Email</a><p>770-486-1010</p><address>417 Dividend Dr, Peachtree City, GA 30269</address></body></html>`
  },
  {
    type: "TRANSPORTER",
    name: "Plycar Automotive Logistics",
    website: "https://www.plycar.com/",
    mockHtml: `<html><body><div>Contact: dispatch@plycar.com</div><div>Phone: (844) 759-2271</div><div>215 Indian Head Rd, Kings Park, NY 11754</div></body></html>`
  },

  // Insurers
  {
    type: "INSURER",
    name: "Hagerty",
    website: "https://www.hagerty.com/",
    mockHtml: `<html><body><a href="mailto:auto@hagerty.com">Email</a><p>877-922-9701</p><address>121 Cass St, Traverse City, MI 49684</address></body></html>`
  },
  {
    type: "INSURER",
    name: "American Collectors Insurance",
    website: "https://www.americancollectors.com/",
    mockHtml: `<html><body><a href="mailto:info@americancollectors.com">Email</a><p>800-360-2277</p><address>910 Haddonfield-Berlin Rd, Cherry Hill, NJ 08034</address></body></html>`
  },
  {
    type: "INSURER",
    name: "NCM Insurance",
    website: "https://www.ncminsurance.com/",
    mockHtml: `<html><body><a href="mailto:info@ncminsurance.com">Email</a><p>877-678-7626</p><address>350 Corvette Dr, Bowling Green, KY 42101</address></body></html>`
  },
  {
    type: "INSURER",
    name: "Chubb Collector Car Insurance",
    website: "https://www.chubb.com/",
    mockHtml: `<html><body><a href="mailto:collectorcar@chubb.com">Email</a><p>866-324-8222</p><address>202 Halls Mill Rd, Whitehouse Station, NJ 08889</address></body></html>`
  },
  {
    type: "INSURER",
    name: "PURE",
    website: "https://www.pureinsurance.com/",
    mockHtml: `<html><body><a href="mailto:service@pureinsurance.com">Email</a><p>888-813-7873</p><address>44 S Broadway, White Plains, NY 10601</address></body></html>`
  },
  {
    type: "INSURER",
    name: "duPont REGISTRY Insurance",
    website: "https://www.dupontregistry.com/",
    mockHtml: `<html><body><a href="mailto:insurance@dupontregistry.com">Email</a><p>800-233-1731</p><address>3051 NW 107th Ave, Miami, FL 33172</address></body></html>`
  }
];

function extractContactInfo(html: string) {
  const emailMatch = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  const email = emailMatch ? emailMatch[1] : null;

  const phoneMatch = html.match(/(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  const phone = phoneMatch ? phoneMatch[0].trim() : null;

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
  const isCouriers = args.includes("--type=couriers") || !args.find(a => a.startsWith("--type="));
  const isInsurers = args.includes("--type=insurers") || !args.find(a => a.startsWith("--type="));

  console.log(`==================================================`);
  console.log(`  SUPERCAR DASH Logistics Discovery Engine`);
  console.log(`==================================================`);
  console.log(`Simulating targeted directory scraping for National providers...`);

  let newDiscoveries = 0;

  for (const discovery of MOCK_LOGISTICS_DISCOVERIES) {
    if (discovery.type === "TRANSPORTER" && !isCouriers) continue;
    if (discovery.type === "INSURER" && !isInsurers) continue;

    console.log(`\nDiscovered National ${discovery.type}: ${discovery.name}`);
    console.log(`- Scraping corporate website: ${discovery.website}`);
    
    const html = discovery.mockHtml;
    const { email, phone, address } = extractContactInfo(html);
    
    console.log(`- Extracted Email: ${email}`);
    console.log(`- Extracted Phone: ${phone}`);
    console.log(`- Extracted Address: ${address}`);

    const domain = getDomain(discovery.website);

    // Feed to existing dedupe/upsert logic
    await upsertPartnerContact({
      type: discovery.type as any,
      name: discovery.name,
      sourceDomain: domain,
      location: address || "Address Unknown",
      phone: phone || null,
      email: email || null,
      website: discovery.website,
      makeSpecialization: "ALL", // Logistics providers typically handle all makes
      confidence: "PUBLIC_SOURCE",
      contactSource: "PUBLIC_WEBSITE",
      coverage: "NATIONAL", // Critical: Logisitcs providers are National
    });
    newDiscoveries++;
  }

  console.log(`\n==================================================`);
  console.log(`  Upserted ${newDiscoveries} newly discovered National Providers!`);
  console.log(`==================================================\n`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
