import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Car Clubs",
  description: "Find and join enthusiast car clubs organized by location, make, and model, then connect with club meets and member garages.",
  path: "/clubs",
  keywords: ["car clubs", "supercar clubs", "tuner car clubs", "local car community"],
});

export default function ClubsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
