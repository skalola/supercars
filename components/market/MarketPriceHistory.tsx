import { prisma } from "@/lib/prisma";
import { getMarketPriceHistory } from "@/lib/market-intelligence";

type MarketPriceHistoryProps = {
  modelId: string;
};

export default async function MarketPriceHistory({ modelId }: MarketPriceHistoryProps) {
  const history = await getMarketPriceHistory(modelId);

  if (history.length === 0) {
    return (
      <div style={{
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "24px",
        background: "#ffffff",
        marginTop: "24px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}>
        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
          Market Price History
        </h3>
        <p style={{ fontSize: "14px", color: "#6b7280", fontStyle: "italic" }}>
          Not enough completed sales data yet.
        </p>
      </div>
    );
  }

  // Fetch individual sales to calculate precise summary stats
  // This protects market intelligence from invalid source pricing.
  const sales = await prisma.marketSale.findMany({
    where: { modelId, salePrice: { gte: 10000 } },
    select: { salePrice: true, saleDate: true },
    orderBy: { saleDate: "asc" },
  });

  const salesCount = sales.length;
  const highestSalePrice = salesCount > 0 ? Math.max(...sales.map((s) => s.salePrice)) : 0;
  const lowestSalePrice = salesCount > 0 ? Math.min(...sales.map((s) => s.salePrice)) : 0;
  const averageSalePrice = salesCount > 0 ? Math.round(sales.reduce((sum, s) => sum + s.salePrice, 0) / salesCount) : 0;

  // Format month to "Month YYYY"
  const formatDate = (dateInput: Date | string) => {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  };

  const firstMonth = salesCount > 0 ? formatDate(sales[0].saleDate) : "";
  const lastMonth = salesCount > 0 ? formatDate(sales[salesCount - 1].saleDate) : "";
  const dateRangeLabel = salesCount === 1 ? firstMonth : `${firstMonth} – ${lastMonth}`;

  // SVG Chart variables
  const prices = history.map((h) => h.averageSalePrice);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceRange = maxP - minP || 1;

  // Pad price range for visual breathing room
  const yMin = Math.max(0, minP - priceRange * 0.15);
  const yMax = maxP + priceRange * 0.15;
  const yRange = yMax - yMin;

  const W = 700;
  const H = 200;
  const PAD_X = 55;
  const PAD_Y = 30;

  const points = history.map((item, idx) => {
    const x = PAD_X + (idx / Math.max(1, history.length - 1)) * (W - PAD_X * 2);
    const y = H - PAD_Y - ((item.averageSalePrice - yMin) / yRange) * (H - PAD_Y * 2);
    return { x, y, ...item };
  });

  const pathD = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = [
    `M ${points[0].x.toFixed(1)} ${H - PAD_Y}`,
    ...points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${H - PAD_Y}`,
    "Z",
  ].join(" ");

  return (
    <div style={{
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      padding: "24px",
      background: "#ffffff",
      marginTop: "24px",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: 0 }}>
            Market Price History
          </h3>
          <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
            Completed sales price history
          </p>
          <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0 0 0" }}>
            Source: Bring a Trailer
          </p>
        </div>
      </div>

      {/* Render chart only if we have at least 2 points for a line chart */}
      {history.length >= 2 ? (
        <div style={{ overflowX: "auto", marginBottom: "24px" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: "500px", display: "block" }}>
            {/* Grid Lines & Y Axis Labels */}
            {[0, 0.5, 1].map((t) => {
              const val = yMin + t * yRange;
              const y = H - PAD_Y - t * (H - PAD_Y * 2);
              return (
                <g key={t}>
                  <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4 4" />
                  <text x={PAD_X - 10} y={y + 4} fontSize="10" fill="#9ca3af" textAnchor="end" fontWeight={500}>
                    ${Math.round(val / 1000)}k
                  </text>
                </g>
              );
            })}

            {/* Area and Line */}
            <path d={areaD} fill="rgba(16, 185, 129, 0.08)" />
            <path d={pathD} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

            {/* Interactive Circles */}
            {points.map((p, idx) => (
              <g key={idx}>
                <circle cx={p.x} cy={p.y} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
                <text
                  x={p.x}
                  y={p.y - 12}
                  fontSize="10"
                  fill="#065f46"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  ${Math.round(p.averageSalePrice / 1000)}k
                </text>
                <text x={p.x} y={H - 10} fontSize="10" fill="#9ca3af" textAnchor="middle" fontWeight={500}>
                  {new Date(Date.UTC(parseInt(p.month.split("-")[0]), parseInt(p.month.split("-")[1]) - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                </text>
              </g>
            ))}
          </svg>
        </div>
      ) : (
        /* If only 1 data point, display a simple visual stats card instead of line chart */
        <div style={{
          background: "#f9fafb",
          border: "1px dashed #e5e7eb",
          borderRadius: "8px",
          padding: "20px",
          textAlign: "center",
          marginBottom: "24px",
        }}>
          <span style={{ fontSize: "24px" }}>📈</span>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#374151", marginTop: "8px" }}>
            Single Month Data Point: {firstMonth}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>
            Average Sold: ${history[0].averageSalePrice.toLocaleString()}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
            Based on {history[0].salesCount} sale(s)
          </div>
        </div>
      )}

      {/* Summary Statistics Display (Chart Footer) */}
      <div style={{
        marginTop: "24px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "12px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}>
        {/* Lowest Sale Price Card */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", background: "#f9fafb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Lowest Sale Price</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#111827", marginTop: "4px" }}>
            ${lowestSalePrice.toLocaleString()}
          </div>
        </div>

        {/* Highest Sale Price Card */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", background: "#f9fafb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Highest Sale Price</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#111827", marginTop: "4px" }}>
            ${highestSalePrice.toLocaleString()}
          </div>
        </div>

        {/* Average Sale Price Card */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", background: "#f9fafb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Average Sale Price</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>
            ${averageSalePrice.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
