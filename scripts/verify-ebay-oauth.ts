import { getEbayApplicationToken } from "../lib/ebay/oauth.server";

async function main() {
  try {
    const token = await getEbayApplicationToken();
    const reusedToken = await getEbayApplicationToken();
    if (reusedToken !== token) throw new Error("eBay OAuth token cache verification failed.");

    console.log("success: true");
    console.log(`token_type: ${token.tokenType}`);
    console.log(`expires_in: ${token.expiresIn}`);
  } catch {
    console.log("success: false");
    console.log("token_type: unavailable");
    console.log("expires_in: unavailable");
    process.exitCode = 1;
  }
}

void main();
