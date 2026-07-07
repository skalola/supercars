import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const makes = await prisma.make.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-10">
      <h1 className="text-3xl font-bold mb-6">Supercars</h1>

      <p className="mb-6 text-gray-600">
        Select a manufacturer
      </p>

      <div className="flex flex-col gap-3">
        {makes.map((make) => (
          <Link
            key={make.id}
            href={`/make/${make.slug}`}
            className="text-blue-600 hover:underline"
          >
            {make.name}
          </Link>
        ))}
      </div>
    </div>
  );
}