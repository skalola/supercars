const EBAY_PRODUCTION_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_SCOPE = "https://api.ebay.com/oauth/api_scope";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type EbayApplicationToken = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number;
};

type EbayTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
};

let cachedToken: EbayApplicationToken | null = null;
let tokenRequest: Promise<EbayApplicationToken> | null = null;

export async function getEbayApplicationToken(): Promise<EbayApplicationToken> {
  assertServerRuntime();

  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  if (!tokenRequest) {
    tokenRequest = requestApplicationToken().finally(() => {
      tokenRequest = null;
    });
  }

  return tokenRequest;
}

async function requestApplicationToken(): Promise<EbayApplicationToken> {
  const clientId = readRequiredEnvironmentVariable("EBAY_CLIENT_ID");
  const clientSecret = readRequiredEnvironmentVariable("EBAY_CLIENT_SECRET");
  const basicCredentials = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_BROWSE_SCOPE,
  });

  const response = await fetch(EBAY_PRODUCTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicCredentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`eBay Production OAuth request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as EbayTokenResponse;
  if (
    typeof payload.access_token !== "string" ||
    payload.access_token.length === 0 ||
    typeof payload.token_type !== "string" ||
    typeof payload.expires_in !== "number" ||
    !Number.isFinite(payload.expires_in) ||
    payload.expires_in <= 0
  ) {
    throw new Error("eBay Production OAuth returned an invalid token response.");
  }

  const token: EbayApplicationToken = {
    accessToken: payload.access_token,
    tokenType: payload.token_type,
    expiresIn: payload.expires_in,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  cachedToken = token;
  return token;
}

function readRequiredEnvironmentVariable(name: "EBAY_CLIENT_ID" | "EBAY_CLIENT_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("eBay OAuth credentials can only be used in a server runtime.");
  }
}
