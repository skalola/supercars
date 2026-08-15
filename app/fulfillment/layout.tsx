import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Fulfillment Request" };

export default function FulfillmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
