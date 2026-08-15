import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Car Makes and Model Catalog",
  description: "Explore supercar, sports car, and tuner manufacturers and models with specifications, market intelligence, maintenance guidance, and ownership tools.",
  path: "/makes",
  keywords: ["car model catalog", "supercar models", "tuner car models", "sports car specifications"],
});

export default function MakesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
