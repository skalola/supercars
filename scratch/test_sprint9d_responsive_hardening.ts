import { readFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

async function source(path: string) {
  return readFile(join(root, path), "utf8");
}

async function main() {
  const [
    globals,
    inventory,
    adminPartners,
    transactionDetail,
    vehiclePage,
  ] = await Promise.all([
    source("app/globals.css"),
    source("components/market/InventoryExplorer.tsx"),
    source("components/admin/AdminPartnersClient.tsx"),
    source("app/transactions/[id]/page.tsx"),
    source("app/vehicle/[vin]/page.tsx"),
  ]);

  assert.match(globals, /\.inventory-shell/, "global CSS should define inventory responsive shell");
  assert.match(globals, /\.inventory-filter-panel/, "global CSS should define inventory filter panel behavior");
  assert.match(globals, /\.transaction-detail-top-grid/, "global CSS should define transaction detail top grid");
  assert.match(globals, /\.transaction-detail-main-grid/, "global CSS should define transaction detail main grid");
  assert.match(globals, /grid-template-columns: 1fr !important;/, "mobile breakpoint should collapse risky grids");
  assert.match(globals, /\.admin-table-shell table\s*\{[\s\S]*min-width: 920px;/, "admin tables should retain internal mobile scrolling");

  assert.match(inventory, /className="page-shell wide inventory-shell"/, "inventory should use the shared responsive shell");
  assert.match(inventory, /className="inventory-filter-panel"/, "inventory filters should use mobile-aware panel class");
  assert.match(inventory, /className="inventory-card-grid"/, "inventory cards should use responsive grid class");
  assert.doesNotMatch(inventory, /📷|🔍/, "inventory should not rely on emoji UI markers");

  assert.match(adminPartners, /className="page-shell wide"/, "admin partners should use shared wide shell");
  assert.match(adminPartners, /className="mobile-scroll admin-table-shell"/, "admin partners table should scroll internally on mobile");
  assert.match(adminPartners, /minWidth: "920px"/, "admin partners table should keep a stable table width inside scroll shell");
  assert.doesNotMatch(adminPartners, /⚠️|🎉|📍|🌐|🛑/, "admin partners should avoid emoji UI markers");

  assert.match(transactionDetail, /className="transaction-detail-header"/, "transaction detail should expose responsive header hook");
  assert.match(transactionDetail, /className="transaction-detail-top-grid"/, "transaction detail should expose responsive top-grid hook");
  assert.match(transactionDetail, /className="transaction-detail-main-grid"/, "transaction detail should expose responsive main-grid hook");
  assert.match(transactionDetail, /className="transaction-detail-card-grid"/, "transaction detail detail cards should collapse on mobile");

  assert.match(vehiclePage, /<main className="page-shell"/, "vehicle page should use the shared page shell");
  assert.doesNotMatch(vehiclePage, /fontFamily: "system-ui"/, "vehicle page should inherit the global font");

  console.log("Sprint 9D responsive hardening checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
