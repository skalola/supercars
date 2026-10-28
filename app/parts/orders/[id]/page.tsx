import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { databaseIdSchema } from "@/lib/validation/common-inputs";
import UserPartOrderControls from "./UserPartOrderControls";
import UserPartOrderIssueControl from "./UserPartOrderIssueControl";

export default async function UserPartOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";
  const { id } = await params;
  const orderId = databaseIdSchema.safeParse(id);
  if (!userId) redirect(`/login?returnTo=${encodeURIComponent(`/parts/orders/${id}`)}`);
  if (!orderId.success) notFound();

  const order = await prisma.userPartOrder.findFirst({
    where: isAdmin
      ? { id: orderId.data }
      : { id: orderId.data, OR: [{ buyerId: userId }, { sellerId: userId }] },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      status: true,
      itemAmountCents: true,
      shippingAmountCents: true,
      platformFeeCents: true,
      totalAmountCents: true,
      buyerName: true,
      shippingName: true,
      shippingAddress: true,
      shippingCarrier: true,
      trackingNumber: true,
      trackingUrl: true,
      sellerNote: true,
      disputeStatus: true,
      disputeReason: true,
      paidAt: true,
      createdAt: true,
      listing: {
        select: {
          title: true,
          condition: true,
          shippingMode: true,
          brandName: true,
          images: { where: { validationStatus: "VALID" }, select: { url: true }, orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }], take: 1 },
          componentType: { select: { name: true } },
        },
      },
      buyer: { select: { name: true, username: true } },
      seller: { select: { name: true, username: true } },
      issues: { where: { reporterId: userId }, select: { issueType: true, status: true, description: true, adminNote: true }, take: 1 },
    },
  });
  if (!order) notFound();
  const isBuyer = order.buyerId === userId;
  const isParticipant = order.buyerId === userId || order.sellerId === userId;

  return (
    <main className="part-order-page">
      <section className="part-order-panel">
        <div className="part-order-eyebrow">Garage Part Transaction</div>
        <div className="part-order-heading">
          <div><h1>{order.listing.title}</h1><p>Order {order.id}</p></div>
          <strong data-status={order.status}>{formatLabel(order.status)}</strong>
        </div>
        {order.status === "DISPUTED" || order.status === "CHARGEBACK" ? (
          <article className="part-order-dispute" role="status">
            <div>
              <span>Payment review</span>
              <h2>{order.status === "CHARGEBACK" ? "Chargeback recorded" : "Transaction temporarily paused"}</h2>
            </div>
            <p>{order.status === "CHARGEBACK"
              ? "Stripe resolved the payment dispute in the buyer's favor. Fulfillment and refund controls are closed."
              : "Stripe is reviewing a payment dispute. Do not ship, hand off, refund, or complete this order until the status changes."}</p>
            {order.disputeReason ? <small>Stripe reason: {formatLabel(order.disputeReason)}</small> : null}
          </article>
        ) : null}
        <div className="part-order-grid">
          <article>
            <h2>Order summary</h2>
            <dl>
              <div><dt>Part</dt><dd>{order.listing.componentType.name}</dd></div>
              <div><dt>Brand</dt><dd>{order.listing.brandName || "Unbranded"}</dd></div>
              <div><dt>Condition</dt><dd>{formatLabel(order.listing.condition)}</dd></div>
              <div><dt>Part price</dt><dd>{formatCents(order.itemAmountCents)}</dd></div>
              <div><dt>Shipping</dt><dd>{formatCents(order.shippingAmountCents)}</dd></div>
              <div className="is-total"><dt>Total</dt><dd>{formatCents(order.totalAmountCents)}</dd></div>
            </dl>
          </article>
          <article>
            <h2>{isBuyer ? "Seller" : "Buyer"}</h2>
            <p>{isBuyer ? order.seller.name || order.seller.username : order.buyerName || order.buyer.name || order.buyer.username}</p>
            <small>{order.paidAt ? `Paid ${order.paidAt.toLocaleDateString()}` : `Started ${order.createdAt.toLocaleDateString()}`}</small>
            {!isBuyer && order.shippingName ? <p className="part-order-shipping">Ship to: {order.shippingName}{formatAddress(order.shippingAddress)}</p> : null}
          </article>
        </div>
        {order.status === "FULFILLED" || order.status === "COMPLETED" ? (
          <article className="part-order-delivery">
            <div><span>Fulfillment</span><h2>{order.listing.shippingMode === "LOCAL_PICKUP" ? "Local handoff" : order.shippingCarrier || "Shipment"}</h2></div>
            {order.trackingNumber ? <p><small>Tracking</small><strong>{order.trackingNumber}</strong></p> : null}
            {order.trackingUrl ? <a href={order.trackingUrl} target="_blank" rel="noreferrer">Track package</a> : null}
            {order.sellerNote ? <p><small>Seller note</small><strong>{order.sellerNote}</strong></p> : null}
          </article>
        ) : null}
        {isParticipant ? <UserPartOrderControls orderId={order.id} status={order.status} isBuyer={isBuyer} shippingMode={order.listing.shippingMode} /> : null}
        {isParticipant ? <UserPartOrderIssueControl orderId={order.id} canReport={["PAID", "FULFILLED", "COMPLETED"].includes(order.status)} issue={order.issues[0] || null} /> : null}
        <div className="part-order-actions">
          <Link href="/transactions">All Transactions</Link>
          <Link href={(isBuyer ? order.seller.username : order.buyer.username) ? `/garage/${isBuyer ? order.seller.username : order.buyer.username}` : "/garage"}>View Garage</Link>
        </div>
      </section>
    </main>
  );
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const address = value as Record<string, unknown>;
  return ` — ${[address.line1, address.line2, address.city, address.state, address.postal_code].filter((part) => typeof part === "string" && part).join(", ")}`;
}
