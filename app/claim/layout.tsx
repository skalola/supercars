import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Claim Vehicle" };

export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  return children;
}
