import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <section className="admin-shell" aria-label="Admin command center">
      <div className="admin-shell-inner">
        <div className="admin-shell-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="admin-shell-title">Command Center</h1>
          </div>
          <p className="admin-shell-copy">
            Manage platform operations, fulfillment, partners, and acquisition workflows from one place.
          </p>
        </div>
        <AdminNav />
      </div>
      {children}
    </section>
  );
}
