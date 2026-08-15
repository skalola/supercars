import type { Metadata } from "next";

export const SITE_NAME = "SUPERCAR DASH";
export const SITE_URL = "https://supercardash.com";
export const DEFAULT_DESCRIPTION =
  "Build a digital garage, explore VIN-backed enthusiast vehicles, follow market intelligence, discover meets, and find parts matched to your car.";
export const DEFAULT_SOCIAL_IMAGE = "/images/garage-home-hero.png";

type PublicMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: "website" | "article";
  keywords?: string[];
};

export function buildPublicMetadata({
  title,
  description,
  path,
  image,
  type = "website",
  keywords,
}: PublicMetadataInput): Metadata {
  const canonicalPath = normalizePath(path);
  const socialImage = image || DEFAULT_SOCIAL_IMAGE;
  const documentTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  return {
    title: { absolute: documentTitle },
    description,
    keywords,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type,
      siteName: SITE_NAME,
      title: documentTitle,
      description,
      url: canonicalPath,
      images: [{ url: socialImage, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: documentTitle,
      description,
      images: [socialImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export const privateMetadata: Metadata = {
  title: "Private",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
};

export function humanizeSlug(value: string) {
  return decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

export function absoluteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(normalizePath(value), SITE_URL).toString();
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normalizePath(path: string) {
  if (!path || path === "/") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}
