import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SUPERCAR DASH",
    short_name: "SUPERCAR DASH",
    description: "Your digital garage for enthusiast cars, market intelligence, meets, and parts.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      { src: "/images/supercar-dash-icon.png", sizes: "500x500", type: "image/png" },
      { src: "/images/supercar-dash-icon.jpg", sizes: "1024x1024", type: "image/jpeg" },
    ],
  };
}
