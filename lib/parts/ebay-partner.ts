import type { PrismaClient } from "@prisma/client";

export async function ensureEbayAffiliatePartner(prisma: PrismaClient) {
  const existing = await prisma.affiliatePartner.findUnique({
    where: { slug: "ebay" },
    select: { id: true, active: true, status: true, network: true },
  });
  if (!existing) {
    return prisma.affiliatePartner.create({
      data: {
        name: "eBay",
        slug: "ebay",
        network: "eBay Partner Network",
        websiteUrl: "https://www.ebay.com",
        status: "ACTIVE",
        active: true,
        disclosure: "SupercarDash may earn a commission when you purchase through partner links.",
      },
      select: { id: true },
    });
  }
  if (!existing.active || existing.status !== "ACTIVE" || existing.network !== "eBay Partner Network") {
    return prisma.affiliatePartner.update({
      where: { id: existing.id },
      data: { active: true, status: "ACTIVE", network: "eBay Partner Network" },
      select: { id: true },
    });
  }
  return { id: existing.id };
}

export async function ensureEbayOfferProvider(prisma: PrismaClient) {
  const partner = await ensureEbayAffiliatePartner(prisma);
  const existing = await prisma.partOfferProvider.findUnique({
    where: { code: "EBAY" },
    select: { id: true, affiliatePartnerId: true, providerType: true, adapterKey: true, active: true },
  });
  if (!existing) {
    const created = await prisma.partOfferProvider.create({
      data: {
        code: "EBAY",
        name: "eBay",
        providerType: "EBAY",
        adapterKey: "EBAY",
        websiteUrl: "https://www.ebay.com",
        affiliatePartnerId: partner.id,
        active: true,
      },
      select: { id: true },
    });
    return { id: created.id, affiliatePartnerId: partner.id };
  }
  if (
    existing.affiliatePartnerId !== partner.id ||
    existing.providerType !== "EBAY" ||
    existing.adapterKey !== "EBAY" ||
    !existing.active
  ) {
    const updated = await prisma.partOfferProvider.update({
      where: { id: existing.id },
      data: { affiliatePartnerId: partner.id, providerType: "EBAY", adapterKey: "EBAY", active: true },
      select: { id: true },
    });
    return { id: updated.id, affiliatePartnerId: partner.id };
  }
  return { id: existing.id, affiliatePartnerId: partner.id };
}
