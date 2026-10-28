"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { moderateUserPartListingAction, reviewUserPartOrderIssueAction } from "@/app/actions/admin-parts";
import type { UserPartOrderIssueStatus } from "@/lib/parts/user-part-order-issue-policy";

type Listing = { id: string; title: string; status: string; priceCents: number; moderationReason: string | null; createdAt: string; componentType: { name: string }; imageUrl: string | null; sellerLabel: string; sellerUsername: string | null };
type Order = { id: string; status: string; totalAmountCents: number; platformFeeCents: number; createdAt: string; title: string; buyerLabel: string; sellerLabel: string };
type Issue = { id: string; orderId: string; title: string; reporterLabel: string; issueType: string; description: string; status: string; adminNote: string | null; createdAt: string };
type Dispute = { id: string; status: string; disputeId: string | null; disputeStatus: string | null; disputeReason: string | null; disputedAt: string | null; disputeResolvedAt: string | null; totalAmountCents: number; title: string; buyerLabel: string; sellerLabel: string };

export default function AdminUserPartMarketplaceClient({ summary, listings, orders, issues, disputes, webhookConfiguration }: { summary: { activeListings: number; pendingOrders: number; completedOrders: number; openIssues: number; openDisputes: number; grossSalesCents: number; platformFeesCents: number }; listings: Listing[]; orders: Order[]; issues: Issue[]; disputes: Dispute[]; webhookConfiguration: { platformConfigured: boolean; connectConfigured: boolean } }) {
  const [tab, setTab] = useState<"listings" | "orders" | "issues" | "disputes">("listings");
  const [target, setTarget] = useState<{ listing: Listing; action: "HIDE" | "REMOVE" } | null>(null);
  const [reason, setReason] = useState("");
  const [issueTarget, setIssueTarget] = useState<Issue | null>(null);
  const [issueStatus, setIssueStatus] = useState<UserPartOrderIssueStatus>("REVIEWING");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function moderate() {
    if (!target) return;
    startTransition(async () => {
      const result = await moderateUserPartListingAction({ listingId: target.listing.id, action: target.action, reason });
      setMessage(result.message);
      if (result.success) { setTarget(null); setReason(""); }
    });
  }

  function reviewIssue() {
    if (!issueTarget) return;
    startTransition(async () => {
      const result = await reviewUserPartOrderIssueAction({ issueId: issueTarget.id, status: issueStatus, adminNote: reason });
      setMessage(result.message);
      if (result.success) { setIssueTarget(null); setReason(""); }
    });
  }

  return <section className="surface-panel admin-user-parts-marketplace">
    <header><div><p className="eyebrow">Garage Marketplace</p><h2>User Parts and Orders</h2><p>Moderate public listings and monitor transaction state. Financial actions remain inside the authorized Stripe workflow.</p></div><div className="admin-user-parts-webhook-health"><span>Stripe webhooks</span><b data-ready={webhookConfiguration.platformConfigured}>{webhookConfiguration.platformConfigured ? "Platform ready" : "Platform secret missing"}</b><b data-ready={webhookConfiguration.connectConfigured}>{webhookConfiguration.connectConfigured ? "Connect ready" : "Connect secret not set"}</b></div></header>
    <div className="admin-user-parts-kpis">
      <Metric label="Active Listings" value={summary.activeListings.toLocaleString()} />
      <Metric label="Open Orders" value={summary.pendingOrders.toLocaleString()} />
      <Metric label="Completed" value={summary.completedOrders.toLocaleString()} />
      <Metric label="Open Issues" value={summary.openIssues.toLocaleString()} />
      <Metric label="Open Disputes" value={summary.openDisputes.toLocaleString()} />
      <Metric label="Gross Sales" value={money(summary.grossSalesCents)} />
      <Metric label="Platform Fees" value={money(summary.platformFeesCents)} />
    </div>
    <div className="admin-user-parts-tabs" role="tablist"><button className={tab === "listings" ? "is-active" : ""} onClick={() => setTab("listings")}>Listings <b>{listings.length}</b></button><button className={tab === "orders" ? "is-active" : ""} onClick={() => setTab("orders")}>Orders <b>{orders.length}</b></button><button className={tab === "issues" ? "is-active" : ""} onClick={() => setTab("issues")}>Issues <b>{summary.openIssues}</b></button><button className={tab === "disputes" ? "is-active" : ""} onClick={() => setTab("disputes")}>Disputes <b>{summary.openDisputes}</b></button></div>
    {message ? <p className="admin-user-parts-message" role="status">{message}</p> : null}
    {tab === "listings" ? <div className="admin-user-parts-list">
      {listings.length ? listings.map((listing) => <article key={listing.id}>
        <div className="admin-user-parts-image">{listing.imageUrl ? <Image src={listing.imageUrl} alt="" fill sizes="72px" /> : <span>No photo</span>}</div>
        <div><span>{listing.componentType.name}</span><strong>{listing.title}</strong><small>{listing.sellerLabel} · {new Date(listing.createdAt).toLocaleDateString()}</small>{listing.moderationReason ? <em>{listing.moderationReason}</em> : null}</div>
        <b data-status={listing.status}>{label(listing.status)}</b><strong>{money(listing.priceCents)}</strong>
        <div className="admin-user-parts-actions">{listing.sellerUsername ? <Link href={`/garage/${listing.sellerUsername}`}>Garage</Link> : null}{listing.status === "ACTIVE" ? <button onClick={() => setTarget({ listing, action: "HIDE" })}>Hide</button> : null}{["DRAFT", "ACTIVE", "INACTIVE"].includes(listing.status) ? <button className="is-danger" onClick={() => setTarget({ listing, action: "REMOVE" })}>Remove</button> : null}</div>
      </article>) : <p>No user part listings yet.</p>}
    </div> : tab === "orders" ? <div className="admin-user-part-orders">
      {orders.length ? orders.map((order) => <Link key={order.id} href={`/parts/orders/${order.id}`}><span>{new Date(order.createdAt).toLocaleDateString()}</span><strong>{order.title}</strong><small>{order.buyerLabel} → {order.sellerLabel}</small><b data-status={order.status}>{label(order.status)}</b><em>{money(order.totalAmountCents)}</em></Link>) : <p>No user part orders yet.</p>}
    </div> : tab === "issues" ? <div className="admin-user-part-issues">{issues.length ? issues.map((issue) => <article key={issue.id}><div><span>{label(issue.issueType)}</span><strong>{issue.title}</strong><small>{issue.reporterLabel} · {new Date(issue.createdAt).toLocaleDateString()}</small></div><p>{issue.description}</p><b data-status={issue.status}>{label(issue.status)}</b><Link href={`/parts/orders/${issue.orderId}`}>Transaction</Link>{issue.status !== "CLOSED" ? <button onClick={() => { setIssueTarget(issue); setReason(issue.adminNote || ""); setIssueStatus(issue.status === "OPEN" ? "REVIEWING" : issue.status as UserPartOrderIssueStatus); }}>Review</button> : null}</article>) : <p>No order issues reported.</p>}</div> : <div className="admin-user-part-disputes">{disputes.length ? disputes.map((dispute) => <Link key={dispute.id} href={`/parts/orders/${dispute.id}`}><div><span>{dispute.disputeReason ? label(dispute.disputeReason) : "Payment dispute"}</span><strong>{dispute.title}</strong><small>{dispute.buyerLabel} → {dispute.sellerLabel}</small></div><small>{dispute.disputedAt ? new Date(dispute.disputedAt).toLocaleDateString() : "Date unavailable"}</small><b data-status={dispute.status}>{label(dispute.disputeStatus || dispute.status)}</b><em>{money(dispute.totalAmountCents)}</em></Link>) : <p>No payment disputes recorded.</p>}</div>}
    {target ? <div className="admin-user-parts-modal-backdrop"><div className="admin-user-parts-modal" role="alertdialog" aria-modal="true"><span>Admin moderation</span><h3>{target.action === "HIDE" ? "Hide listing from buyers?" : "Permanently remove listing?"}</h3><p>{target.listing.title}</p><label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={4} placeholder="Required for the moderation audit trail" /></label><div><button disabled={pending} onClick={() => setTarget(null)}>Cancel</button><button className="is-danger" disabled={pending || reason.trim().length < 5} onClick={moderate}>{pending ? "Saving..." : `Confirm ${target.action.toLowerCase()}`}</button></div></div></div> : null}
    {issueTarget ? <div className="admin-user-parts-modal-backdrop"><div className="admin-user-parts-modal" role="dialog" aria-modal="true"><span>Order issue review</span><h3>{issueTarget.title}</h3><p>{issueTarget.description}</p><label>Status<select value={issueStatus} onChange={(event) => setIssueStatus(event.target.value as UserPartOrderIssueStatus)}><option value="REVIEWING">Reviewing</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select></label><label>Admin note<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={5} placeholder="Record the review outcome. Refunds must use the transaction workflow." /></label><div><button disabled={pending} onClick={() => setIssueTarget(null)}>Cancel</button><button className="is-danger" disabled={pending || reason.trim().length < 5} onClick={reviewIssue}>{pending ? "Saving..." : "Save review"}</button></div></div></div> : null}
  </section>;
}

function Metric({ label: text, value }: { label: string; value: string }) { return <div><span>{text}</span><strong>{value}</strong></div>; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
