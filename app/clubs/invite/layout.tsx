import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Club Invitation" };

export default function ClubInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
