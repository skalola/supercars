import Link from "next/link";
import { getLiveInventoryListingStats } from "@/lib/admin/listing-filters";
import { realFulfillmentWhere, withRealFulfillmentWhere } from "@/lib/admin/fulfillment-filters";
import { emailMatchesWebsiteDomain } from "@/lib/directory/contact-domain-policy";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { prisma } from "@/lib/prisma";

const RECENT_TRANSACTION_WINDOW_DAYS = 30;

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getPercent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function labelPartnerType(type: string) {
  switch (type) {
    case "SERVICE_SHOP":
      return "Service";
    case "TRANSPORTER":
      return "Courier";
    case "INSURER":
      return "Insurance";
    case "DEALER":
      return "Dealer";
    default:
      return type.replace("_", " ");
  }
}

function getWindowStart(window: "month" | "year" | "lifetime", now: Date) {
  if (window === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (window === "year") {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null;
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ salesWindow?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const selectedSalesWindow =
    resolvedSearchParams?.salesWindow === "month" || resolvedSearchParams?.salesWindow === "year"
      ? resolvedSearchParams.salesWindow
      : "lifetime";
  const now = new Date();
  const selectedSalesWindowStart = getWindowStart(selectedSalesWindow, now);
  const recentWindowStart = new Date(now);
  recentWindowStart.setDate(now.getDate() - RECENT_TRANSACTION_WINDOW_DAYS);
  const previousWindowStart = new Date(recentWindowStart);
  previousWindowStart.setDate(recentWindowStart.getDate() - RECENT_TRANSACTION_WINDOW_DAYS);

  const [
    activeSessions,
    liveInventoryStats,
    partnerContacts,
    recentTransactions,
    recentVolume,
    previousVolume,
    pendingFulfillmentCount,
    acceptedOpenCount,
    fulfillmentByStatus,
    fulfillmentByType,
    fulfillmentVolumeByType,
    salesRequestStats,
    completedSalesStats,
  ] = await Promise.all([
      prisma.session.findMany({
        where: { expires: { gt: now } },
        distinct: ["userId"],
        select: { userId: true },
      }),
      getLiveInventoryListingStats(),
      prisma.partnerContact.findMany({
        where: { active: true },
        select: {
          type: true,
          email: true,
          website: true,
          phone: true,
          city: true,
          state: true,
          contactStatus: true,
        },
      }),
      prisma.fulfillmentRequest.count({
        where: withRealFulfillmentWhere({ createdAt: { gte: recentWindowStart } }),
      }),
      prisma.fulfillmentRequest.aggregate({
        where: withRealFulfillmentWhere({ createdAt: { gte: recentWindowStart } }),
        _sum: { collectedAmount: true },
      }),
      prisma.fulfillmentRequest.aggregate({
        where: withRealFulfillmentWhere({
          createdAt: { gte: previousWindowStart, lt: recentWindowStart },
        }),
        _sum: { collectedAmount: true },
      }),
      prisma.fulfillmentRequest.count({
        where: withRealFulfillmentWhere({ status: { in: ["READY_TO_SEND", "SENT", "VIEWED"] } }),
      }),
      prisma.fulfillmentRequest.count({
        where: withRealFulfillmentWhere({ status: "ACCEPTED" }),
      }),
      prisma.fulfillmentRequest.groupBy({
        by: ["status"],
        where: realFulfillmentWhere,
        _count: { id: true },
      }),
      prisma.fulfillmentRequest.groupBy({
        by: ["requestType"],
        where: realFulfillmentWhere,
        _count: { id: true },
      }),
      prisma.fulfillmentRequest.groupBy({
        by: ["requestType"],
        where: realFulfillmentWhere,
        _count: { id: true },
        _sum: {
          collectedAmount: true,
          expectedPlatformFee: true,
          expectedPartnerCommission: true,
        },
      }),
      prisma.fulfillmentRequest.aggregate({
        where: withRealFulfillmentWhere({
          requestType: "DEALER_PURCHASE",
          ...(selectedSalesWindowStart ? { createdAt: { gte: selectedSalesWindowStart } } : {}),
        }),
        _count: { id: true },
        _sum: {
          collectedAmount: true,
          expectedPlatformFee: true,
          expectedPartnerCommission: true,
        },
        _avg: {
          collectedAmount: true,
        },
      }),
      prisma.fulfillmentRequest.aggregate({
        where: withRealFulfillmentWhere({
          requestType: "DEALER_PURCHASE",
          status: "COMPLETED",
          paymentStatus: "CAPTURED",
          collectedAmount: { gt: 0 },
          ...(selectedSalesWindowStart ? { completedAt: { gte: selectedSalesWindowStart } } : {}),
        }),
        _count: { id: true },
        _sum: {
          collectedAmount: true,
          expectedPlatformFee: true,
          expectedPartnerCommission: true,
        },
        _avg: {
          collectedAmount: true,
        },
      }),
    ]);

  const inventoryListings = liveInventoryStats.listings;
  const activeListingCount = liveInventoryStats.liveListingCount;
  const recentTransactionAmount = recentVolume._sum.collectedAmount || 0;
  const previousTransactionAmount = previousVolume._sum.collectedAmount || 0;
  const volumeDelta = recentTransactionAmount - previousTransactionAmount;
  const totalInventoryValue = liveInventoryStats.totalLiveListingValue;
  const pricedListingCount = liveInventoryStats.pricedListingCount;
  const avgListingPrice = liveInventoryStats.averageLiveListingPrice;
  const listingsWithoutPrice = activeListingCount - pricedListingCount;
  const publicEligiblePartners = partnerContacts.filter(
    (partner) =>
      isValidEmail(partner.email) &&
      emailMatchesWebsiteDomain(partner.email, partner.website) &&
      Boolean(partner.phone) &&
      Boolean(partner.website) &&
      Boolean(partner.city) &&
      Boolean(partner.state)
  );
  const unresolvedVendorCount = partnerContacts.length - publicEligiblePartners.length;

  const listingsByMake = Array.from(
    inventoryListings.reduce((map, listing) => {
      const make = listing.vehicle?.model.make.name || listing.model.make.name;
      map.set(make, (map.get(make) || 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const topSources = Array.from(
    inventoryListings.reduce((map, listing) => {
      const source = listing.source?.name || listing.dealerName || "Unknown";
      map.set(source, (map.get(source) || 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const pipelineRows = fulfillmentByStatus
    .map((row) => ({ label: row.status, value: row._count.id }))
    .sort((a, b) => b.value - a.value);
  const pipelineTotal = pipelineRows.reduce((sum, row) => sum + row.value, 0);

  const requestTypeRows = fulfillmentByType
    .map((row) => ({ label: row.requestType.replace("_", " "), value: row._count.id }))
    .sort((a, b) => b.value - a.value);
  const requestTypeTotal = requestTypeRows.reduce((sum, row) => sum + row.value, 0);
  const requestVolumeRows = fulfillmentVolumeByType
    .map((row) => ({
      key: row.requestType,
      label: row.requestType.replace("_", " "),
      value: row._count.id,
      collected: row._sum.collectedAmount || 0,
      platformFee: row._sum.expectedPlatformFee || 0,
      partnerCommission: row._sum.expectedPartnerCommission || 0,
    }))
    .sort((a, b) => b.value - a.value);
  const requestVolumeTotal = requestVolumeRows.reduce((sum, row) => sum + row.value, 0);
  const salesRequestCount = salesRequestStats._count.id;
  const completedSalesCount = completedSalesStats._count.id;
  const completedSalesVolume = completedSalesStats._sum.collectedAmount || 0;
  const avgCompletedSalePrice = completedSalesStats._avg.collectedAmount || 0;
  const completedSalesFees = completedSalesStats._sum.expectedPlatformFee || 0;
  const completedPartnerCommission = completedSalesStats._sum.expectedPartnerCommission || 0;

  const segmentCards = [
    {
      key: "DEALER_PURCHASE",
      label: "Sales",
      helper: "Dealer purchase packages",
    },
    {
      key: "SERVICE_BOOKING",
      label: "Service",
      helper: "Service bookings",
    },
    {
      key: "INSURANCE_QUOTE",
      label: "Insurance",
      helper: "Insurance quote referrals",
    },
    {
      key: "TRANSPORT_QUOTE",
      label: "Transport",
      helper: "Enclosed transport quotes",
    },
  ].map((segment) => {
    const row = requestVolumeRows.find((item) => item.key === segment.key);
    return {
      ...segment,
      count: row?.value || 0,
      collected: row?.collected || 0,
      platformFee: row?.platformFee || 0,
    };
  });

  const salesWindowCards = [
    {
      label: "Completed Sales",
      value: completedSalesCount.toLocaleString(),
      detail: "Closed dealer purchases with captured payment",
    },
    {
      label: "Completed Sales Dollars",
      value: formatCurrency(completedSalesVolume),
      detail: "Real platform sales volume only",
    },
    {
      label: "Avg Completed Sale",
      value: formatCurrency(avgCompletedSalePrice),
      detail: "Average captured dealer-purchase amount",
    },
    {
      label: "Sales Requests",
      value: salesRequestCount.toLocaleString(),
      detail: "Dealer purchase requests created",
    },
    {
      label: "Sales Fees",
      value: formatCurrency(completedSalesFees),
      detail: "Platform fees from completed sales",
    },
    {
      label: "Partner Commission",
      value: formatCurrency(completedPartnerCommission),
      detail: "Commission tied to completed sales",
    },
  ];

  const vendorRows = Array.from(
    publicEligiblePartners.reduce((map, partner) => {
      map.set(partner.type, (map.get(partner.type) || 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([type, value]) => ({ label: labelPartnerType(type), value }))
    .sort((a, b) => b.value - a.value);
  const vendorTotal = vendorRows.reduce((sum, row) => sum + row.value, 0);

  const attentionItems = [
    {
      label: "Fulfillment follow-up",
      value: pendingFulfillmentCount,
      detail: "Requests sent or ready that have not been accepted or closed.",
    },
    {
      label: "Accepted work to close",
      value: acceptedOpenCount,
      detail: "Accepted requests that still need completion or payment settlement.",
    },
    {
      label: "Vendor email gaps",
      value: unresolvedVendorCount,
      detail: "Admin-only vendors missing valid, domain-matched contact data.",
    },
    {
      label: "Listings missing price",
      value: listingsWithoutPrice,
      detail: "Visible inventory where price is unavailable.",
    },
  ];

  const metrics = [
    {
      label: "Active Sessions",
      value: activeSessions.length.toLocaleString(),
      detail: "Currently valid logged-in sessions",
      percent: getPercent(activeSessions.length, Math.max(activeSessions.length + 1, 1)),
    },
    {
      label: "Live Listing Value",
      value: formatCurrency(totalInventoryValue),
      detail: `${pricedListingCount.toLocaleString()} live visible listings`,
      percent: getPercent(pricedListingCount, activeListingCount),
    },
    {
      label: "Avg Listing Price",
      value: formatCurrency(avgListingPrice),
      detail: `${activeListingCount.toLocaleString()} visible verified listings`,
      percent: getPercent(activeListingCount, Math.max(activeListingCount + listingsWithoutPrice, 1)),
    },
    {
      label: "Partner Portal",
      value: vendorTotal.toLocaleString(),
      detail: `${unresolvedVendorCount.toLocaleString()} admin-only partner gaps`,
      percent: getPercent(vendorTotal, partnerContacts.length),
    },
    {
      label: "30-Day Volume",
      value: formatCurrency(recentTransactionAmount),
      detail: `${recentTransactions.toLocaleString()} requests in the last ${RECENT_TRANSACTION_WINDOW_DAYS} days`,
      percent: getPercent(recentTransactionAmount, Math.max(recentTransactionAmount + previousTransactionAmount, 1)),
    },
  ];

  return (
    <main className="page-shell wide">
      <section className="admin-overview-hero">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Platform KPIs</h2>
        </div>
        <p>
          Traffic tracking is enabled through Vercel Web Analytics. Visitor data appears in the Vercel
          dashboard after deployment.
        </p>
      </section>

      <section className="admin-overview-metrics" aria-label="Admin overview metrics">
        {metrics.map((metric) => (
          <div key={metric.label} className="surface-card admin-visual-kpi-card">
            <div
              className="admin-kpi-ring"
              style={{ background: `conic-gradient(var(--foreground) ${metric.percent}%, var(--surface-soft) 0)` }}
              aria-hidden="true"
            >
              <span>{metric.percent}%</span>
            </div>
            <div>
              <span>{metric.label}</span>
              <strong className={metric.value.startsWith("$") ? "currency-value" : undefined}>
                {metric.value}
              </strong>
              <p>{metric.detail}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="surface-panel admin-analytics-panel admin-sales-panel" aria-label="Sales analytics">
        <div className="admin-analytics-panel-header">
            <div>
              <span>Sales Performance</span>
            <strong>{formatCurrency(completedSalesVolume)}</strong>
          </div>
          <div className="admin-period-tabs" aria-label="Sales period filter">
            {[
              { key: "month", label: "Month" },
              { key: "year", label: "Year" },
              { key: "lifetime", label: "Lifetime" },
            ].map((period) => (
              <Link
                key={period.key}
                href={`/admin/overview?salesWindow=${period.key}`}
                className={selectedSalesWindow === period.key ? "is-active" : ""}
                aria-current={selectedSalesWindow === period.key ? "page" : undefined}
              >
                {period.label}
              </Link>
            ))}
          </div>
        </div>
        <p>
          Sales KPIs only use completed dealer-purchase transactions with captured platform payment.
          Market intelligence records are excluded from platform sales totals.
        </p>
        <div className="admin-sales-kpi-grid">
          {salesWindowCards.map((card) => (
            <div key={card.label} className="admin-sales-kpi-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-analytics-grid" aria-label="Decision analytics">
        <div className="surface-panel admin-analytics-panel admin-analytics-panel-wide">
          <div className="admin-analytics-panel-header">
            <div>
              <span>Fulfillment Revenue Mix</span>
              <strong>{requestVolumeTotal.toLocaleString()}</strong>
            </div>
            <em>Requests</em>
          </div>
          <p>Counts and collected volume by the four transaction segments that drive monetization.</p>
          <div className="admin-segment-grid">
            {segmentCards.map((segment) => (
              <div key={segment.key} className="admin-segment-card">
                <div
                  className="admin-kpi-ring small"
                  style={{
                    background: `conic-gradient(var(--foreground) ${getPercent(segment.count, requestVolumeTotal)}%, var(--surface-soft) 0)`,
                  }}
                  aria-hidden="true"
                >
                  <span>{segment.count}</span>
                </div>
                <div>
                  <strong>{segment.label}</strong>
                  <span>{segment.helper}</span>
                  <p>{formatCurrency(segment.collected)} collected</p>
                  <em>{formatCurrency(segment.platformFee)} expected fees</em>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel admin-analytics-panel">
          <div className="admin-analytics-panel-header">
            <div>
              <span>Transaction Pipeline</span>
              <strong>{formatCurrency(recentTransactionAmount)}</strong>
            </div>
            <em className={volumeDelta >= 0 ? "positive" : "negative"}>
              {volumeDelta >= 0 ? "+" : ""}
              {formatCurrency(volumeDelta)}
            </em>
          </div>
          <p>Collected platform volume versus the previous 30-day window, with current request status distribution.</p>
          <div className="admin-bar-list">
            {pipelineRows.map((row) => (
              <div key={row.label} className="admin-bar-row">
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value.toLocaleString()}</strong>
                </div>
                <i style={{ width: `${Math.max(getPercent(row.value, pipelineTotal), 3)}%` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel admin-analytics-panel">
          <div className="admin-analytics-panel-header">
            <div>
              <span>Inventory Mix</span>
              <strong>{formatCurrency(avgListingPrice)}</strong>
            </div>
            <em>Avg price</em>
          </div>
          <p>Visible buyer inventory by make and source concentration.</p>
          <div className="admin-bar-list">
            {listingsByMake.map((row) => (
              <div key={row.label} className="admin-bar-row">
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value.toLocaleString()}</strong>
                </div>
                <i style={{ width: `${Math.max(getPercent(row.value, activeListingCount), 3)}%` }} />
              </div>
            ))}
          </div>
          <div className="admin-mini-list">
            {topSources.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel admin-analytics-panel">
          <div className="admin-analytics-panel-header">
            <div>
              <span>Partner Portal Coverage</span>
              <strong>{vendorTotal.toLocaleString()}</strong>
            </div>
            <em>{unresolvedVendorCount.toLocaleString()} gaps</em>
          </div>
          <p>Public-ready partners with valid domain-matched email, website, phone, city, and state.</p>
          <div className="admin-bar-list">
            {vendorRows.map((row) => (
              <div key={row.label} className="admin-bar-row">
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value.toLocaleString()}</strong>
                </div>
                <i style={{ width: `${Math.max(getPercent(row.value, vendorTotal), 3)}%` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel admin-analytics-panel">
          <div className="admin-analytics-panel-header">
            <div>
              <span>Owner Attention</span>
              <strong>{attentionItems.reduce((sum, item) => sum + item.value, 0).toLocaleString()}</strong>
            </div>
            <em>Open items</em>
          </div>
          <p>Operational areas most likely to block revenue or trust.</p>
          <div className="admin-attention-list">
            {attentionItems.map((item) => (
              <div key={item.label}>
                <strong>{item.value.toLocaleString()}</strong>
                <span>{item.label}</span>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel admin-analytics-panel admin-analytics-panel-wide">
          <div className="admin-analytics-panel-header">
            <div>
              <span>Request Demand</span>
              <strong>{requestTypeTotal.toLocaleString()}</strong>
            </div>
            <em>All time</em>
          </div>
          <p>Fulfillment request mix shows where buyers and owners are creating work.</p>
          <div className="admin-bar-list compact">
            {requestTypeRows.map((row) => (
              <div key={row.label} className="admin-bar-row">
                <div>
                  <span>{row.label}</span>
                  <strong>{row.value.toLocaleString()}</strong>
                </div>
                <i style={{ width: `${Math.max(getPercent(row.value, requestTypeTotal), 3)}%` }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
