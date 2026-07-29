"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminTabs = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin/fulfillment", label: "Fulfillment" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/marketing", label: "Marketing" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav-tabs" aria-label="Admin sections">
      {adminTabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`admin-nav-tab${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
