import Link from "next/link";
import { prisma } from "@/lib/prisma";

type MakePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function MakePage({ params }: MakePageProps) {
  const { slug } = await params;

  const make = await prisma.make.findUnique({
    where: { slug },
    include: {
      models: {
        orderBy: { name: "asc" },
      },
    },
  });

  if (!make) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Make not found</h1>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "system-ui",
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: 56,
          fontWeight: 800,
        }}
      >
        {make.name}
      </h1>

      <p style={{ color: "#666", marginTop: 8 }}>Explore available models</p>

      <div
        style={{
          marginTop: 40,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        {make.models.map((model) => (
          <Link
            key={model.id}
            href={`/make/${make.slug}/${model.slug}`}
            style={{
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 20,
                background: "white",
                boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {model.name}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#888",
                  marginTop: 6,
                }}
              >
                {model.slug}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
