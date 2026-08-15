import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Vehicle Parts Store",
  description: "Find OEM, replacement, and performance parts organized by your car, vehicle system, and component with compatible marketplace offers.",
  path: "/parts",
  keywords: ["performance car parts", "OEM car parts", "Ferrari parts", "vehicle fitment"],
});

export default function PartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
