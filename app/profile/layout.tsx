import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Profile Settings" };

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
