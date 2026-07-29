import { requireAdmin } from "@/lib/admin/auth";
import { getInventoryDashboardListings } from "@/lib/admin/listing-filters";
import { AdminListingsTable, AdminListingRow } from "@/components/admin/AdminListingsTable";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (!value) return "Not listed";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatMileage(value: number | null | undefined) {
  if (!value) return "Not listed";
  return `${value.toLocaleString()} mi`;
}

export default async function AdminListingsPage() {
  await requireAdmin();

  const listings = await getInventoryDashboardListings();

  const rows: AdminListingRow[] = listings.flatMap((listing) => {
    const vehicle = listing.vehicle;
    if (!vehicle) return [];

    const trim = vehicle.trim || "";
    const vehicleLabel = [vehicle.year, vehicle.model.make.name, vehicle.model.name, trim]
      .filter(Boolean)
      .join(" ");

    return [{
      id: listing.id,
      vehicleLabel,
      make: vehicle.model.make.name,
      model: vehicle.model.name,
      year: vehicle.year,
      vin: vehicle.vin,
      status: listing.status,
      price: formatCurrency(listing.price || listing.askingPrice),
      mileage: formatMileage(listing.mileage),
      dealerName: listing.dealerName || "Unknown",
      location: listing.location || "Unknown",
      sourceName: listing.source?.name || "Direct",
      externalListingId: listing.externalListingId,
      url: listing.url,
      updatedAt: formatDate(listing.updatedAt),
      updatedAtIso: listing.updatedAt.toISOString(),
    }];
  });

  return (
    <main className="page-shell wide">
      <AdminListingsTable listings={rows} />
    </main>
  );
}
