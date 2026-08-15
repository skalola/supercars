import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Edit Vehicle Passport" };

export default function VehicleEditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
