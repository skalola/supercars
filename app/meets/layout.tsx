import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Car Meets and Owner Events",
  description: "Discover cars and coffee events, cruises, track days, and owner gatherings connected to verified digital garages.",
  path: "/meets",
  keywords: ["car meets", "cars and coffee", "car cruises", "track days", "supercar events"],
});

export default function MeetsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
