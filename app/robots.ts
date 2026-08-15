import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/claim/",
        "/fulfillment/",
        "/login",
        "/onboarding",
        "/profile/",
        "/transactions/",
        "/vehicle/*/edit",
        "/garage/*/trackers",
        "/clubs/invite/",
        "/meets/host",
        "/out/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
