import { getMarketPriceHistory } from "@/lib/market-intelligence";

type MarketPriceHistoryProps = {
  modelId: string;
  compact?: boolean;
};

type ChartPoint = {
  month: string;
  value: number;
  count: number;
};

const W = 760;
const H = 260;
const PAD_X = 54;
const PAD_TOP = 18;
const PAD_BOTTOM = 32;

export default async function MarketPriceHistory({ modelId, compact = false }: MarketPriceHistoryProps) {
  const history = await getMarketPriceHistory(modelId);
  const soldPoints = history
    .filter((item) => item.averageSalePrice !== null)
    .map((item) => ({ month: item.month, value: item.averageSalePrice!, count: item.salesCount }));
  const listingPoints = history
    .filter((item) => item.averageListingPrice !== null)
    .map((item) => ({ month: item.month, value: item.averageListingPrice!, count: item.listingCount }));
  const allPrices = [...soldPoints, ...listingPoints].map((point) => point.value);

  if (allPrices.length === 0) {
    return (
      <section className={`surface-card${compact ? " market-price-history-compact" : ""}`} style={{ marginTop: compact ? 0 : 24 }}>
        {!compact ? (
          <h3 style={{ fontSize: 18, fontWeight: 760, color: "var(--foreground)", margin: "0 0 8px" }}>
            Market Price History
          </h3>
        ) : null}
        <p style={{ fontSize: 14, color: "var(--muted)", fontStyle: "italic", margin: 0 }}>
          Not enough sold or listing price data yet.
        </p>
      </section>
    );
  }

  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const priceRange = maxP - minP || Math.max(maxP, 1);
  const yMin = Math.max(0, minP - priceRange * 0.14);
  const yMax = maxP + priceRange * 0.14;
  const yRange = yMax - yMin || 1;

  const months = compact ? buildContinuousMonthDomain(history.map((item) => item.month)) : history.map((item) => item.month);
  const soldSvgPoints = toSvgPoints(soldPoints, months, yMin, yRange);
  const listingSvgPoints = toSvgPoints(listingPoints, months, yMin, yRange);
  const soldStats = getStats(soldPoints);
  const listingStats = getStats(listingPoints);
  const soldColor = compact ? "#d1d5db" : "#0f766e";
  const listedColor = compact ? "#ef233c" : "#2563eb";
  const gridColor = compact ? "rgba(255, 255, 255, 0.12)" : "#e8e8e8";
  const labelColor = compact ? "rgba(255, 255, 255, 0.5)" : "#8a8f98";

  return (
    <section className={`surface-card${compact ? " market-price-history-compact" : ""}`} style={{ marginTop: compact ? 0 : 24, overflow: "hidden" }}>
      {!compact ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 760, color: "var(--foreground)", margin: 0 }}>
              Market Price History
            </h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
              Sold comps and known listing price trends
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--muted)", fontWeight: 760 }}>
            <LegendSwatch color="#0f766e" label="Cars sold" />
            <LegendSwatch color="#2563eb" label="Cars listed" />
          </div>
        </div>
      ) : null}

      {months.length >= 2 ? (
        <div className={compact ? "market-price-history-chart-frame" : undefined} style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0, marginBottom: compact ? 0 : 22 }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: compact ? 0 : 560, height: compact ? 224 : undefined, display: "block" }} aria-label="Market price history chart">
            {[0, 0.33, 0.66, 1].map((t) => {
              const val = yMin + t * yRange;
              const y = H - PAD_BOTTOM - t * (H - PAD_TOP - PAD_BOTTOM);
              return (
                <g key={t}>
                  <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray={compact ? "2 7" : "4 4"} />
                  <text x={PAD_X - 11} y={y + 4} fontSize={compact ? "9" : "10"} fill={labelColor} textAnchor="end" fontWeight={650}>
                    ${Math.round(val / 1000)}k
                  </text>
                </g>
              );
            })}

            <SeriesPath points={listingSvgPoints} color={listedColor} fillColor={compact ? "rgba(239, 35, 60, 0.12)" : "rgba(37, 99, 235, 0.08)"} compact={compact} />
            <SeriesPath points={soldSvgPoints} color={soldColor} fillColor={compact ? "rgba(209, 213, 219, 0.08)" : "rgba(15, 118, 110, 0.08)"} compact={compact} />

            {months.map((month, idx) => {
              const x = PAD_X + (idx / Math.max(1, months.length - 1)) * (W - PAD_X * 2);
              const shouldShowLabel = !compact || idx === 0 || idx === months.length - 1 || idx % Math.ceil(months.length / 6) === 0;
              if (!shouldShowLabel) return null;
              return (
                <text key={month} x={x} y={H - 12} fontSize={compact ? "9" : "10"} fill={labelColor} textAnchor="middle" fontWeight={650}>
                  {formatMonth(month)}
                </text>
              );
            })}
          </svg>
        </div>
      ) : (
        <div style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 18, background: "var(--surface-soft)", marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 760, color: "var(--muted)" }}>Single month data point</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 10 }}>
            {soldPoints[0] ? <MiniStat label="Average Sold" value={formatCurrency(soldPoints[0].value)} tone="#0f766e" /> : null}
            {listingPoints[0] ? <MiniStat label="Average Listed" value={formatCurrency(listingPoints[0].value)} tone="#2563eb" /> : null}
          </div>
        </div>
      )}

      {!compact ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <MiniStat label="Avg Sold" value={soldStats.average ? formatCurrency(soldStats.average) : "No sold data"} tone="#0f766e" />
          <MiniStat label="Sold Data Points" value={soldStats.count.toLocaleString()} />
          <MiniStat label="Avg Listed" value={listingStats.average ? formatCurrency(listingStats.average) : "No listing data"} tone="#2563eb" />
          <MiniStat label="Listing Data Points" value={listingStats.count.toLocaleString()} />
        </div>
      ) : null}
    </section>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
      {label}
    </span>
  );
}

function SeriesPath({ points, color, fillColor, compact = false }: { points: Array<ChartPoint & { x: number; y: number }>; color: string; fillColor: string; compact?: boolean }) {
  if (points.length === 0) return null;

  if (points.length === 1) {
    const point = points[0];
    return (
      <g>
        <circle cx={point.x} cy={point.y} r={compact ? "4.6" : "5"} fill={color} stroke={compact ? "#111111" : "#ffffff"} strokeWidth={compact ? "2" : "2.5"} />
        {!compact ? (
          <text x={point.x} y={point.y - 12} fontSize="10" fill={color} fontWeight="760" textAnchor="middle">
            ${Math.round(point.value / 1000)}k
          </text>
        ) : null}
      </g>
    );
  }

  const pathD = points.map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaD = [
    `M ${points[0].x.toFixed(1)} ${H - PAD_BOTTOM}`,
    ...points.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${H - PAD_BOTTOM}`,
    "Z",
  ].join(" ");

  return (
    <g>
      <path d={areaD} fill={fillColor} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={compact ? "3" : "3"} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point) => (
        <g key={`${point.month}:${point.value}`}>
          <circle cx={point.x} cy={point.y} r={compact ? "3.8" : "4.5"} fill={color} stroke={compact ? "#111111" : "#ffffff"} strokeWidth={compact ? "1.8" : "2.25"} />
          {!compact ? (
            <text x={point.x} y={point.y - 11} fontSize="10" fill={color} fontWeight="760" textAnchor="middle">
              ${Math.round(point.value / 1000)}k
            </text>
          ) : null}
        </g>
      ))}
    </g>
  );
}

function MiniStat({ label, value, tone = "var(--foreground)" }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--surface-soft)" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 760, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 820, color: tone, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function toSvgPoints(points: ChartPoint[], months: string[], yMin: number, yRange: number) {
  return points.map((point) => {
    const idx = months.indexOf(point.month);
    const x = PAD_X + (idx / Math.max(1, months.length - 1)) * (W - PAD_X * 2);
    const y = H - PAD_BOTTOM - ((point.value - yMin) / yRange) * (H - PAD_TOP - PAD_BOTTOM);
    return { ...point, x, y };
  });
}

function buildContinuousMonthDomain(rawMonths: string[]) {
  const months = [...new Set(rawMonths)].sort();
  if (months.length < 2) return months;

  const first = parseMonthKey(months[0]);
  const last = parseMonthKey(months[months.length - 1]);
  if (!first || !last) return months;

  const result: string[] = [];
  const cursor = new Date(Date.UTC(first.year, first.month - 1, 1));
  const end = new Date(Date.UTC(last.year, last.month - 1, 1));

  while (cursor <= end) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}

function parseMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return null;
  return { year, month: monthNumber };
}

function getStats(points: ChartPoint[]) {
  const totalCount = points.reduce((sum, point) => sum + point.count, 0);
  const weightedSum = points.reduce((sum, point) => sum + point.value * point.count, 0);
  return {
    count: totalCount,
    average: totalCount > 0 ? Math.round(weightedSum / totalCount) : null,
  };
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}
