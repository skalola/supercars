import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function FerrariModelPartsPage({
  params,
}: {
  params: Promise<{ modelSlug: string }>;
}) {
  const { modelSlug } = await params;
  const model = await prisma.model.findFirst({
    where: { slug: modelSlug, make: { slug: "ferrari" } },
    select: { slug: true },
  });
  if (!model) redirect("/parts?make=ferrari");
  redirect(`/parts?make=ferrari&model=${encodeURIComponent(model.slug)}`);
}
