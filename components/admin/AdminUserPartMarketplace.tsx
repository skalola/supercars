import { prisma } from "@/lib/prisma";
import AdminUserPartMarketplaceClient from "./AdminUserPartMarketplaceClient";
import { getStripeWebhookConfigurationStatus } from "@/lib/payments/payment-service";

export async function AdminUserPartMarketplace() {
  const webhookConfiguration = getStripeWebhookConfigurationStatus();
  const [activeListings, pendingOrders, completedOrders, openIssues, openDisputes, grossSales, listings, orders, issues, disputes] = await Promise.all([
    prisma.userPartListing.count({ where: { status: "ACTIVE" } }),
    prisma.userPartOrder.count({ where: { status: { in: ["CHECKOUT_PENDING", "PAID", "FULFILLED", "REFUND_PENDING"] } } }),
    prisma.userPartOrder.count({ where: { status: "COMPLETED" } }),
    prisma.userPartOrderIssue.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
    prisma.userPartOrder.count({ where: { status: "DISPUTED" } }),
    prisma.userPartOrder.aggregate({ where: { status: { in: ["PAID", "FULFILLED", "COMPLETED"] } }, _sum: { totalAmountCents: true, platformFeeCents: true } }),
    prisma.userPartListing.findMany({
      select: { id: true, title: true, status: true, priceCents: true, moderationReason: true, createdAt: true, seller: { select: { name: true, username: true } }, componentType: { select: { name: true } }, images: { where: { validationStatus: "VALID" }, select: { url: true }, orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }], take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.userPartOrder.findMany({
      select: { id: true, status: true, totalAmountCents: true, platformFeeCents: true, createdAt: true, listing: { select: { title: true } }, buyer: { select: { name: true, username: true } }, seller: { select: { name: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.userPartOrderIssue.findMany({
      select: { id: true, issueType: true, description: true, status: true, adminNote: true, createdAt: true, reporter: { select: { name: true, username: true } }, order: { select: { id: true, listing: { select: { title: true } } } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 40,
    }),
    prisma.userPartOrder.findMany({
      where: { disputeId: { not: null } },
      select: {
        id: true,
        status: true,
        disputeStatus: true,
        disputeReason: true,
        disputeId: true,
        disputedAt: true,
        disputeResolvedAt: true,
        totalAmountCents: true,
        listing: { select: { title: true } },
        buyer: { select: { name: true, username: true } },
        seller: { select: { name: true, username: true } },
      },
      orderBy: [{ disputedAt: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
  ]);

  return <AdminUserPartMarketplaceClient
    summary={{ activeListings, pendingOrders, completedOrders, openIssues, openDisputes, grossSalesCents: grossSales._sum.totalAmountCents || 0, platformFeesCents: grossSales._sum.platformFeeCents || 0 }}
    listings={listings.map((listing) => ({ ...listing, createdAt: listing.createdAt.toISOString(), imageUrl: listing.images[0]?.url || null, sellerLabel: listing.seller.name || listing.seller.username || "Unknown seller", sellerUsername: listing.seller.username }))}
    orders={orders.map((order) => ({ ...order, createdAt: order.createdAt.toISOString(), title: order.listing.title, buyerLabel: order.buyer.name || order.buyer.username || "Unknown buyer", sellerLabel: order.seller.name || order.seller.username || "Unknown seller" }))}
    issues={issues.map((issue) => ({ ...issue, createdAt: issue.createdAt.toISOString(), orderId: issue.order.id, title: issue.order.listing.title, reporterLabel: issue.reporter.name || issue.reporter.username || "Unknown user" }))}
    disputes={disputes.map((dispute) => ({
      ...dispute,
      disputedAt: dispute.disputedAt?.toISOString() || null,
      disputeResolvedAt: dispute.disputeResolvedAt?.toISOString() || null,
      title: dispute.listing.title,
      buyerLabel: dispute.buyer.name || dispute.buyer.username || "Unknown buyer",
      sellerLabel: dispute.seller.name || dispute.seller.username || "Unknown seller",
    }))}
    webhookConfiguration={webhookConfiguration}
  />;
}
