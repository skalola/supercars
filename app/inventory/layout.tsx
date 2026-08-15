import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Live Enthusiast Vehicle Market",
  description: "Browse VIN-backed Ferrari, Lamborghini, and McLaren listings with verified photos, live prices, and original listing sources.",
  path: "/inventory",
  keywords: ["Ferrari for sale", "Lamborghini for sale", "McLaren for sale", "VIN verified supercars"],
});

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
