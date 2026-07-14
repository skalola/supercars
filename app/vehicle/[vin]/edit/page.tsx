import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import VehicleEditorForm from "./VehicleEditorForm";

type EditPageProps = {
  params: Promise<{ vin: string }>;
};

export default async function VehicleEditPage({ params }: EditPageProps) {
  const { vin } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    include: {
      model: {
        include: {
          make: true,
        },
      },
      profile: true,
      modifications: {
        orderBy: { createdAt: "desc" },
      },
      serviceRecords: {
        orderBy: { serviceDate: "desc" },
      },
      awards: {
        orderBy: { awardDate: "desc" },
      },
      photos: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Verify ownership
  if (!vehicle || vehicle.ownerId !== userId || vehicle.status !== "CLAIMED") {
    redirect(`/vehicle/${vin}`);
  }

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: "#111827" }}>
            Edit Passport
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: 15 }}>
            {vehicle.model.make.name} {vehicle.model.name} ({vehicle.year})
          </p>
        </div>

        <Link href={`/vehicle/${vin}`} style={{
          fontSize: "14px",
          color: "#4b5563",
          fontWeight: 600,
          textDecoration: "none",
          border: "1px solid #d1d5db",
          padding: "8px 16px",
          borderRadius: "8px",
          transition: "all 0.2s"
        }}>
          ← Back to Passport
        </Link>
      </div>

      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <VehicleEditorForm vehicle={vehicle} />
      </div>
    </main>
  );
}
