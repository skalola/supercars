export function getHostname(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "").split(":")[0] || null;
  } catch {
    return null;
  }
}

export function getRootDomain(hostname?: string | null) {
  if (!hostname) return null;

  const labels = hostname.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return null;

  const last = labels[labels.length - 1];
  const secondLast = labels[labels.length - 2];
  if (["co", "com", "net", "org"].includes(secondLast) && last.length === 2 && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

export function getEmailDomain(email?: string | null) {
  return email?.trim().toLowerCase().split("@")[1] || null;
}

export function emailMatchesWebsiteDomain(email?: string | null, website?: string | null) {
  const emailRoot = getRootDomain(getEmailDomain(email));
  const websiteHostname = getHostname(website);
  const websiteRoot = getRootDomain(websiteHostname);

  if (!emailRoot || !websiteRoot) return false;
  if (emailRoot === websiteRoot) return true;

  return isOfficialDealerMicrositeHostname(websiteHostname) && !isMarketplaceHostname(emailRoot);
}

export function isOfficialDealerMicrositeHostname(hostname?: string | null) {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase().replace(/^www\./, "");

  return [
    "ferraridealers.com",
    "preowned.ferrari.com",
    "lamborghini.com",
    "preowned.lamborghini.com",
    "mclaren.com",
    "preowned.mclaren.com",
  ].some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function isMarketplaceHostname(hostname?: string | null) {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase().replace(/^www\./, "");

  return [
    "autotrader.com",
    "cars.com",
    "dupontregistry.com",
    "bringatrailer.com",
    "hemmings.com",
    "google.com",
    "goo.gl",
    "maps.app.goo.gl",
    "ferrari.com",
    "lamborghini.com",
    "mclaren.com",
  ].some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function isDealerOwnedWebsite(value?: string | null) {
  const hostname = getHostname(value);
  return Boolean(hostname && !isMarketplaceHostname(hostname));
}

export function buildSalesEmailForWebsite(value?: string | null) {
  const hostname = getHostname(value);
  if (!hostname || isMarketplaceHostname(hostname) || isOfficialDealerMicrositeHostname(hostname)) return null;
  const rootDomain = getRootDomain(hostname);
  return rootDomain ? `sales@${rootDomain}` : null;
}
