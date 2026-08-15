import type { ReactNode } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminNav } from "./AdminNav";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Admin Command Center" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <section className="admin-shell" aria-label="Admin command center">
      <div className="admin-shell-inner">
        <div className="admin-shell-header">
          <div>
            <p className="eyebrow">SUPERCAR DASH Admin</p>
            <h1 className="admin-shell-title">Command Center</h1>
          </div>
          <p className="admin-shell-copy">
            Monitor inventory quality, fulfillment, partners, users, and marketing automation from one place.
          </p>
        </div>
        <AdminNav />
      </div>
      {children}
    </section>
  );
}
