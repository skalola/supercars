import {
  deleteStoredFile,
  isPrivateStoredFile,
  readPrivateFile,
  uploadPrivateFile,
} from "../lib/media/upload-storage";
import { prisma } from "../lib/prisma";

const execute = process.argv.includes("--execute");

async function main() {
  const documents = await prisma.vehicleDocument.findMany({
    select: {
      id: true,
      vehicleId: true,
      title: true,
      filePath: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const legacyDocuments = documents.filter((document) => !isPrivateStoredFile(document.filePath));

  console.log(`${legacyDocuments.length} of ${documents.length} vehicle documents require private migration.`);
  if (!execute || legacyDocuments.length === 0) {
    if (!execute && legacyDocuments.length > 0) {
      console.log("Dry run only. Re-run with --execute to migrate files.");
    }
    return;
  }

  let migrated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const document of legacyDocuments) {
    try {
      const source = await readPrivateFile(document.filePath);
      if (!source) throw new Error("Source file could not be read.");

      const bytes = await new Response(source.body).arrayBuffer();
      const file = new File(
        [bytes],
        `${safeFilename(document.title)}.${source.extension}`,
        { type: source.contentType },
      );
      const upload = await uploadPrivateFile({
        file,
        folder: `vehicles/${document.vehicleId}/documents`,
      });

      const updated = await prisma.vehicleDocument.updateMany({
        where: { id: document.id, filePath: document.filePath },
        data: { filePath: upload.url },
      });
      if (updated.count !== 1) {
        await deleteStoredFile(upload.url);
        throw new Error("Document changed during migration; private copy was removed.");
      }

      await deleteStoredFile(document.filePath);
      migrated += 1;
      console.log(`Migrated ${document.id}`);
    } catch (error) {
      failures.push({
        id: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log({ migrated, failed: failures.length });
  if (failures.length > 0) {
    console.error(failures);
    process.exitCode = 1;
  }
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "vehicle-document";
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
