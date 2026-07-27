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
    layout,
    home,
    login,
    garage,
    transactions,
    admin,
  ] = await Promise.all([
    source("app/globals.css"),
    source("app/layout.tsx"),
    source("app/page.tsx"),
    source("app/login/page.tsx"),
    source("app/garage/page.tsx"),
    source("components/transactions/TransactionCenterClient.tsx"),
    source("components/admin/AdminOpsCenterClient.tsx"),
  ]);

  assert.match(globals, /--font-clean-sans: Inter/, "global CSS should define the clean sans-serif stack");
  assert.match(globals, /letter-spacing: 0;/, "global typography should avoid negative letter spacing");
  assert.match(globals, /\.site-header/, "global CSS should own the responsive site header");
  assert.match(globals, /\.page-shell/, "global CSS should expose shared page spacing");
  assert.match(globals, /@media \(max-width: 720px\)/, "global CSS should include mobile breakpoint rules");
  assert.match(globals, /\.transaction-row\s*\{[\s\S]*grid-template-columns: 1fr !important;/, "transaction rows should collapse on mobile");
  assert.match(globals, /\.admin-table-shell table\s*\{[\s\S]*min-width: 920px;/, "admin tables should scroll inside a mobile shell");

  assert.match(layout, /import "\.\/globals\.css"/, "root layout must import global UX CSS");
  assert.match(layout, /className="site-header"/, "root layout should use shared header class");
  assert.match(layout, /className="site-nav"/, "root layout should use shared nav class");
  assert.match(layout, /className="site-button"/, "root layout should use shared button class");

  assert.match(home, /className="page-shell"/, "home page should use shared page shell");
  assert.match(home, /className="page-title"/, "home page should use shared title scale");
  assert.match(login, /className="surface-panel"/, "login page should use shared surface panel");
  assert.match(garage, /className="surface-panel"/, "garage page should use shared surface panel");
  assert.match(transactions, /className="transaction-toolbar"/, "transaction center should expose responsive toolbar hook");
  assert.match(transactions, /className="transaction-row"/, "transaction center should expose responsive row hook");
  assert.match(admin, /className="mobile-scroll admin-table-shell"/, "admin dashboard table should use mobile scroll shell");

  console.log("Sprint 9C global UX system checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
