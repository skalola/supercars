import { mkdir, writeFile, access, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicModelsRoot = path.join(projectRoot, "public", "images", "models");

const curatedAssets: Record<string, Record<string, Array<string>>> = {
  ferrari: {
    f40: ["/images/models/curated/ferrari-f40.jpg"],
  },
  lamborghini: {
    gallardo: ["/images/models/curated/lamborghini-gallardo.jpg"],
    countach: ["/images/models/curated/lamborghini-countach.jpg"],
  },
};

async function fileExists(pathname: string) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(pathname: string) {
  await mkdir(pathname, { recursive: true });
}

function resolveLocalAssetPath(imageUrl: string) {
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return null;
  }

  if (imageUrl.startsWith("/")) {
    return path.join(projectRoot, "public", imageUrl.replace(/^\/+/, ""));
  }

  return path.join(publicModelsRoot, imageUrl);
}

async function downloadImage(url: string, outputPath: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("image")) {
    throw new Error(`Unexpected content type for ${url}: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength < 2000) {
    throw new Error(`Downloaded image from ${url} is too small`);
  }

  await ensureDirectory(path.dirname(outputPath));
  await writeFile(outputPath, Buffer.from(arrayBuffer));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getExtension(url: string) {
  const match = url.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
  return match ? match[1].toLowerCase() : "jpg";
}

async function saveImage(modelId: string, makeSlug: string, modelSlug: string, imageUrl: string, source: string) {
  const targetDir = path.join(publicModelsRoot, makeSlug, modelSlug);
  const localSourcePath = resolveLocalAssetPath(imageUrl);
  const extension = localSourcePath ? path.extname(localSourcePath) || getExtension(imageUrl) : getExtension(imageUrl);
  const filename = `hero${extension.startsWith(".") ? extension : `.${extension}`}`;
  const targetPath = path.join(targetDir, filename);
  const relativeUrl = `/images/models/${makeSlug}/${modelSlug}/${filename}`;

  await ensureDirectory(targetDir);

  if (localSourcePath) {
    if (await fileExists(localSourcePath)) {
      await copyFile(localSourcePath, targetPath);
    } else {
      await downloadImage(imageUrl, targetPath);
    }
  } else {
    await downloadImage(imageUrl, targetPath);
  }

  await prisma.modelImage.upsert({
    where: {
      modelId_url: {
        modelId,
        url: relativeUrl,
      },
    },
    update: {
      source,
      type: "hero",
    },
    create: {
      modelId,
      url: relativeUrl,
      source,
      type: "hero",
    },
  });
}

async function removePlaceholderArtifacts(modelId: string, makeSlug: string, modelSlug: string) {
  await prisma.modelImage.deleteMany({
    where: {
      modelId,
      OR: [{ source: "local-placeholder" }, { source: "placeholder" }, { url: { contains: ".svg" } }],
    },
  });

  await rm(path.join(publicModelsRoot, makeSlug, modelSlug), { recursive: true, force: true });
}

function extractImageUrls(html: string) {
  const seen = new Set<string>();
  const matches = html.matchAll(/https?:\/\/[^\s"')<>]+\.(?:jpe?g|png|webp)(?:\?[^\s"')<>]*)?/gi);

  for (const match of matches) {
    const candidate = match[0].replace(/\?.*$/, "");
    if (!candidate.includes("placeholder") && !candidate.includes("logo") && !candidate.includes("avatar")) {
      seen.add(candidate);
    }
  }

  return Array.from(seen);
}

function preferRelevantImage(imageUrls: string[], modelSlug: string, modelName: string) {
  const normalizedModelSlug = normalize(modelSlug);
  const normalizedModelName = normalize(modelName);

  return (
    imageUrls.find((value) => {
      const normalizedValue = normalize(value);
      return normalizedValue.includes(normalizedModelSlug) || normalizedValue.includes(normalizedModelName);
    }) ?? imageUrls[0]
  );
}

async function importFromSources(model: { id: string; make: { slug: string }; slug: string; name: string }) {
  const makeSlug = model.make.slug;
  const modelSlug = model.slug;
  const modelName = model.name;
  const candidateUrls = [
    `https://www.autoevolution.com/${makeSlug}/${modelSlug}/`,
    `https://www.autoevolution.com/${makeSlug}/${modelSlug}`,
    `https://www.autoevolution.com/${makeSlug}/`,
    makeSlug === "ferrari"
      ? "https://www.supercars.net/blog/all-brands/ferrari/ferrari-model-list/"
      : "https://www.lambocars.com/misc/lamborghini-data/lamborghini-models/",
  ];

  for (const sourceUrl of candidateUrls) {
    try {
      const response = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const imageUrls = extractImageUrls(html);
      const relevantImage = preferRelevantImage(imageUrls, modelSlug, modelName);

      if (relevantImage) {
        await saveImage(model.id, makeSlug, modelSlug, relevantImage, sourceUrl.includes("autoevolution") ? "autoevolution" : "catalog-source");
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

async function importCuratedAssets(model: { id: string; make: { slug: string }; slug: string }) {
  const curated = curatedAssets[model.make.slug]?.[model.slug];
  if (!curated?.length) {
    return false;
  }

  for (const imageUrl of curated) {
    await saveImage(model.id, model.make.slug, model.slug, imageUrl, "curated-local");
  }

  return true;
}

async function importModelImagesForModel(model: { id: string; make: { slug: string }; slug: string; name: string }) {
  if (await importFromSources(model)) {
    return true;
  }

  return importCuratedAssets(model);
}

async function main() {
  const models = await prisma.model.findMany({
    include: { make: true },
    orderBy: [{ make: { name: "asc" } }, { name: "asc" }],
  });

  const targetModels = models.filter((model) => ["ferrari", "lamborghini"].includes(model.make.slug));

  for (const model of targetModels) {
    const existingImages = await prisma.modelImage.findMany({
      where: { modelId: model.id },
      select: { id: true, source: true, url: true },
    });

    const needsReplacement = existingImages.some(
      (image) => image.source === "local-placeholder" || image.source === "placeholder" || image.url.includes(".svg"),
    );

    if (existingImages.length > 0 && !needsReplacement) {
      continue;
    }

    if (needsReplacement) {
      await removePlaceholderArtifacts(model.id, model.make.slug, model.slug);
    }

    try {
      const imported = await importModelImagesForModel(model);
      if (!imported) {
        console.log(`No stock image found for ${model.make.slug}/${model.slug}`);
      }
    } catch (error) {
      console.warn(`Skipped image import for ${model.make.slug}/${model.slug}:`, error);
    }
  }

  console.log(`Processed ${targetModels.length} Ferrari/Lamborghini models.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
