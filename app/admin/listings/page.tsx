import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_LISTINGS_PAGE_SIZE, getAdminInventoryListingCount, getAdminInventoryListings } from "@/lib/admin/listing-filters";
import { AdminListingsTable, AdminListingRow } from "@/components/admin/AdminListingsTable";
import { AdminPagination, parseAdminPage } from "@/components/admin/AdminPagination";

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

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  await requireAdmin();
  const requestedPage = parseAdminPage((await searchParams)?.page);

  const totalListings = await getAdminInventoryListingCount();
  const totalPages = Math.max(1, Math.ceil(totalListings / ADMIN_LISTINGS_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const listings = await getAdminInventoryListings(page);
  const referenceTimeIso = new Date().toISOString();

  const rows: AdminListingRow[] = listings.flatMap((listing) => {
    const vehicle = listing.vehicle;
    if (!vehicle) return [];

    const trim = vehicle.trim || "";
    const vehicleLabel = [vehicle.year, vehicle.model.make.name, vehicle.model.name, trim]
      .filter(Boolean)
      .join(" ");

    return [{
      id: listing.id,
      imageUrl: listing.imageUrl,
      vehicleLabel,
      make: vehicle.model.make.name,
      model: vehicle.model.name,
      year: vehicle.year,
      vin: vehicle.vin,
      status: listing.status,
      validationStatus: listing.validationStatus || "UNKNOWN",
      priceStatus: listing.priceStatus || "UNKNOWN",
      freshnessStatus: listing.freshnessStatus || "UNKNOWN",
      price: formatCurrency(listing.askingPrice || listing.price),
      mileage: formatMileage(listing.mileage),
      dealerName: listing.dealerName || "Unknown",
      location: listing.location || "Unknown",
      sourceName: listing.source?.name || "Direct",
      sourceWebsite: listing.source?.website || null,
      sourceType: listing.source?.type || null,
      externalListingId: listing.externalListingId,
      url: listing.url,
      updatedAt: formatDate(listing.updatedAt),
      updatedAtIso: listing.updatedAt.toISOString(),
    }];
  });

  return (
    <main className="page-shell wide">
      <AdminListingsTable listings={rows} totalCount={totalListings} referenceTimeIso={referenceTimeIso} />
      <AdminPagination pathname="/admin/listings" page={page} totalPages={totalPages} />
    </main>
  );
}
