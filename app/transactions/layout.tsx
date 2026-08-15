import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Transactions" };

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
