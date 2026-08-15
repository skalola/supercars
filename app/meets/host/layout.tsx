import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Host a Meet" };

export default function HostMeetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
