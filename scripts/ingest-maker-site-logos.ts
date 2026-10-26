import { put } from "@vercel/blob";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";

const logoSources: Record<string, string> = {
  acura: "https://cdn.simpleicons.org/acura/FFFFFF",
  bmw: "https://cdn.simpleicons.org/bmw/FFFFFF",
  chevrolet: "https://cdn.simpleicons.org/chevrolet/FFFFFF",
  ferrari: "https://cdn.simpleicons.org/ferrari/FFFFFF",
  ford: "https://cdn.simpleicons.org/ford/FFFFFF",
  honda: "https://cdn.simpleicons.org/honda/FFFFFF",
  lamborghini: "https://cdn.simpleicons.org/lamborghini/FFFFFF",
  lexus: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Lexus.svg",
  mclaren: "https://cdn.simpleicons.org/mclaren/FFFFFF",
  "mercedes-benz": "https://commons.wikimedia.org/wiki/Special:Redirect/file/Mercedes-Benz%20logo.svg",
  nissan: "https://cdn.simpleicons.org/nissan/FFFFFF",
  toyota: "https://cdn.simpleicons.org/toyota/FFFFFF",
};

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required.");

  for (const [slug, sourceUrl] of Object.entries(logoSources)) {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Unable to fetch ${slug} logo (${response.status}).`);

    const png = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(640, 360, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const blob = await put(`maker-sites/logos/${slug}.png`, png, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/png",
      cacheControlMaxAge: 31_536_000,
    });

    await prisma.make.update({ where: { slug }, data: { logoUrl: blob.url } });
    console.log(`${slug}: stored ${png.byteLength} bytes`);
  }
}

main().finally(() => prisma.$disconnect());
