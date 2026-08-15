import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Tracker Settings" };

export default function TrackersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
