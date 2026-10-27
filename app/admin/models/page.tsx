import { requireAdmin } from "@/lib/admin/auth";
import { getModelCatalogCoverage } from "@/lib/admin/model-catalog-coverage";

export default async function AdminModelsPage() {
  await requireAdmin();
  const rows = await getModelCatalogCoverage();
  const totals = rows.reduce((sum, row) => ({
    models: sum.models + row.modelCount,
    images: sum.images + row.imageCount,
    specs: sum.specs + row.completeCoreSpecCount,
    review: sum.review + row.reviewEvidenceCount,
  }), { models: 0, images: 0, specs: 0, review: 0 });

  return (
    <main className="page-shell wide">
      <section className="surface-panel admin-catalog-coverage">
        <header className="admin-section-heading">
          <div><p className="eyebrow">Catalog quality</p><h2>Model Coverage</h2></div>
          <p>Canonical families, specifications, imagery, maintenance, and source evidence by make.</p>
        </header>
        <div className="admin-overview-metrics">
          <CoverageMetric label="Models" value={totals.models} />
          <CoverageMetric label="With images" value={totals.images} />
          <CoverageMetric label="Core specs complete" value={totals.specs} />
          <CoverageMetric label="Evidence to review" value={totals.review} />
        </div>
        <div className="admin-table-shell">
          <table>
            <thead><tr><th>Make</th><th>Models</th><th>Images</th><th>Specs</th><th>Descriptions</th><th>Variants</th><th>Maintenance</th><th>Review</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.makeId}>
                <td><strong>{row.makeName}</strong></td>
                <td>{row.modelCount}</td>
                <td>{coverage(row.imageCount, row.modelCount)}</td>
                <td>{coverage(row.completeCoreSpecCount, row.modelCount)}</td>
                <td>{coverage(row.descriptionCount, row.modelCount)}</td>
                <td>{row.variantCount}</td>
                <td>{row.specificMaintenanceCount}</td>
                <td>{row.reviewEvidenceCount}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function CoverageMetric({ label, value }: { label: string; value: number }) {
  return <article className="surface-card admin-metric-card"><span>{label}</span><strong>{value.toLocaleString()}</strong></article>;
}

function coverage(value: number, total: number) {
  return total ? `${value}/${total} (${Math.round(value / total * 100)}%)` : "0";
}
