import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Vehicle Model Intelligence",
  description: "Explore model specifications, price history, live listings, maintenance intelligence, and compatible performance parts.",
  path: "/makes",
});

export default function MakeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
