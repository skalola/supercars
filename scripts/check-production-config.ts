type Check = {
  label: string;
  ok: boolean;
  message: string;
};

const checks: Check[] = [];

const appUrl = read("NEXT_PUBLIC_APP_URL") || read("APP_URL");
const authSecret = read("AUTH_SECRET") || read("NEXTAUTH_SECRET");
const paymentProvider = read("PAYMENT_PROVIDER").toLowerCase();
const mailProvider = read("MAIL_PROVIDER").toLowerCase();

check("Database", isPostgresUrl(read("DATABASE_URL")), "DATABASE_URL must be a PostgreSQL connection URL.");
check(
  "Neon pooled database connection",
  isPooledNeonUrl(read("DATABASE_URL")),
  "DATABASE_URL must use the Neon pooled hostname containing -pooler."
);
check("Application URL", isProductionHttpsUrl(appUrl), "NEXT_PUBLIC_APP_URL must be a public HTTPS URL, not localhost.");
check("Authentication secret", authSecret.length >= 32, "AUTH_SECRET must contain at least 32 characters.");
check("Google authentication", hasGoogleCredentials(), "Configure AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.");
check(
  "Test credentials",
  read("ENABLE_TEST_CREDENTIALS").toLowerCase() !== "true",
  "ENABLE_TEST_CREDENTIALS must not be true in production."
);
check("Cron authentication", read("CRON_SECRET").length >= 32, "CRON_SECRET must contain at least 32 characters.");
check("Blob storage", Boolean(read("BLOB_READ_WRITE_TOKEN")), "BLOB_READ_WRITE_TOKEN is required for persistent public uploads.");

check("Payment provider", paymentProvider === "stripe", "PAYMENT_PROVIDER must be stripe before real transactions.");
check("Stripe live key", read("STRIPE_SECRET_KEY").startsWith("sk_live_"), "Use a Stripe live secret key.");
check("Stripe webhook", read("STRIPE_WEBHOOK_SECRET").startsWith("whsec_"), "Configure the live Stripe webhook signing secret.");

check("Mail provider", mailProvider === "resend", "MAIL_PROVIDER must be resend for production delivery.");
check("Resend API", read("RESEND_API_KEY").startsWith("re_"), "Configure RESEND_API_KEY.");
check("Mail sender", isProductionSender(read("MAIL_FROM"), appUrl), "MAIL_FROM must use the production domain, not resend.dev.");

const failures = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.label}${item.ok ? "" : `: ${item.message}`}`);
}

if (failures.length > 0) {
  console.error(`\nProduction configuration failed ${failures.length} check${failures.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("\nProduction configuration passed without exposing secret values.");

function check(label: string, ok: boolean, message: string) {
  checks.push({ label, ok, message });
}

function read(key: string) {
  return process.env[key]?.trim() || "";
}

function isPostgresUrl(value: string) {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.slice(1));
  } catch {
    return false;
  }
}

function isPooledNeonUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return !hostname.includes("neon.tech") || hostname.includes("-pooler");
  } catch {
    return false;
  }
}

function isProductionHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function hasGoogleCredentials() {
  const id = read("AUTH_GOOGLE_ID") || read("GOOGLE_CLIENT_ID");
  const secret = read("AUTH_GOOGLE_SECRET") || read("GOOGLE_CLIENT_SECRET");
  return Boolean(id && secret);
}

function isProductionSender(value: string, baseUrl: string) {
  const match = value.match(/<([^>]+)>/) || value.match(/([^\s]+@[^\s]+)/);
  const email = match?.[1]?.toLowerCase() || "";
  const emailDomain = email.split("@")[1] || "";
  if (!emailDomain || emailDomain === "resend.dev") return false;

  try {
    const appDomain = new URL(baseUrl).hostname.replace(/^www\./, "").toLowerCase();
    return emailDomain === appDomain || emailDomain.endsWith(`.${appDomain}`);
  } catch {
    return false;
  }
}
