import { prisma } from "@/lib/prisma";

type VehiclePageProps = {
  params: Promise<{ vin: string }>;
};

export default async function VehiclePage({ params }: VehiclePageProps) {
  const { vin } = await params;

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    include: {
      model: {
        include: {
          make: true,
        },
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!vehicle) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Vehicle not found</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>
        {vehicle.model.make.name} {vehicle.model.name}
      </h1>

      <p>VIN: {vehicle.vin}</p>
      <p>Year: {vehicle.year}</p>
      <p>Color: {vehicle.color ?? "Unknown"}</p>
      <p>Mileage: {vehicle.mileage ?? "Unknown"}</p>
      <p>Transmission: {vehicle.transmission ?? "Unknown"}</p>
      <p>Drivetrain: {vehicle.drivetrain ?? "Unknown"}</p>
      <p>Engine: {vehicle.engine ?? "Unknown"}</p>
    </div>
  );
}
