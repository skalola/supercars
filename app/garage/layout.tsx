import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Digital Garage",
  description: "Claim VIN-backed vehicles, build a dream garage, document ownership, track maintenance, and share your enthusiast car collection.",
  path: "/garage",
  keywords: ["digital garage", "car collection", "vehicle passport", "VIN ownership"],
});

export default function GarageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
