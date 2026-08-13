import { prisma } from "../lib/prisma";
import { resolveUnresolvedPartnerContact } from "../lib/fulfillment/partner-registry";
import { getBatchLimit, isExecuteMode, logScriptMode } from "./lib/script-guards";
import https from "https";
import http from "http";

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html",
        },
        timeout: 5000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          return resolve(fetchHtml(redirectUrl));
        }
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve(data);
        });
      }
    );
    req.on("error", () => {
      resolve("");
    });
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
  });
}

function extractEmails(html: string): string[] {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const matches = [...html.matchAll(emailRegex)].map((m) => m[1].toLowerCase());
  
  // Filter out dummy or common bad matches
  const validEmails = matches.filter(e => {
    if (e.endsWith(".png") || e.endsWith(".jpg") || e.endsWith(".gif") || e.endsWith(".js") || e.endsWith(".css")) return false;
    if (e.includes("sentry") || e.includes("wixpress") || e.includes("example.com")) return false;
    if (e.includes("dummy") || e.includes("test")) return false;
    return true;
  });
  
  return Array.from(new Set(validEmails));
}

async function enrichPartnerDirectory() {
  const execute = isExecuteMode();
  const limit = getBatchLimit({ defaultLimit: 50, maxLimit: 200 });
  logScriptMode("enrich-partner-directory", execute, limit);
  console.log("Starting Partner Directory Enrichment...");

  const unresolved = await prisma.partnerContact.findMany({
    where: {
      OR: [
        { contactStatus: "UNRESOLVED_EMAIL" },
        { email: null }
      ],
      active: true,
      website: { not: null }
    },
    select: {
      id: true,
      name: true,
      website: true,
    },
    orderBy: [{ updatedAt: "asc" }, { name: "asc" }],
    take: limit,
  });

  console.log(`Found ${unresolved.length} unresolved partners with a website to scan.`);

  let resolvedCount = 0;

  for (const partner of unresolved) {
    if (!partner.website) continue;
    
    console.log(`\nScanning ${partner.name} (${partner.website})...`);
    
    let html = await fetchHtml(partner.website);
    let emails = extractEmails(html);

    if (emails.length === 0) {
      // Try /contact or /contact-us
      const contactUrl = new URL("/contact", partner.website).toString();
      console.log(`  -> No email found on homepage. Trying ${contactUrl}...`);
      html = await fetchHtml(contactUrl);
      emails = extractEmails(html);
    }

    if (emails.length === 0) {
      const contactUsUrl = new URL("/contact-us", partner.website).toString();
      console.log(`  -> No email found on /contact. Trying ${contactUsUrl}...`);
      html = await fetchHtml(contactUsUrl);
      emails = extractEmails(html);
    }

    if (emails.length > 0) {
      // Prefer standard sales/info emails if multiple are found
      let bestEmail = emails.find(e => e.startsWith("sales@") || e.startsWith("info@") || e.startsWith("contact@"));
      if (!bestEmail) bestEmail = emails[0];

      console.log(`  -> SUCCESS! Found email: ${bestEmail}`);
      
      try {
        if (execute) {
          await resolveUnresolvedPartnerContact(
            partner.id,
            bestEmail,
            "PUBLIC_SOURCE",
            "PUBLIC_WEBSITE"
          );
        }
        resolvedCount++;
        console.log(`  -> ${execute ? "Partner marked as RESOLVED." : "Would mark partner as RESOLVED."}`);
      } catch (error) {
        console.error(`  -> Failed to resolve: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log(`  -> FAILED to find any emails on website.`);
    }
  }

  console.log(`\nEnrichment complete! Automatically resolved ${resolvedCount} partners.`);
}

enrichPartnerDirectory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
