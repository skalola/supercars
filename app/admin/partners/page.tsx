import DirectoryTabs, { DirectoryVendor, DirectoryVendorType } from "@/app/directory/DirectoryTabs";
import { AdminDirectoryActions } from "@/components/admin/AdminDirectoryActions";
import { AdminPagination, parseAdminPage } from "@/components/admin/AdminPagination";
import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_DIRECTORY_PAGE_SIZE, getAdminDirectoryPage } from "@/lib/admin/directory-ops";
import { formatCityState, normalizePartnerLocation, normalizePhoneNumber } from "@/lib/directory/partner-contact-format";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";

const allowedTypes = new Set<DirectoryVendorType>([
  "DEALER",
  "SERVICE_SHOP",
  "TRANSPORTER",
  "INSURER",
]);

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string | string[];
    type?: string;
    make?: string;
    location?: string;
    lat?: string;
    lng?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const requestedPage = parseAdminPage(params?.page);
  const type = allowedTypes.has(params?.type as DirectoryVendorType)
    ? params?.type as DirectoryVendorType
    : "DEALER";
  const make = params?.make?.trim() || "ALL";
  const location = params?.location?.trim() || "";
  const latitude = parseCoordinate(params?.lat, -90, 90);
  const longitude = parseCoordinate(params?.lng, -180, 180);

  const catalog = await getMakeModelCatalogOptions();
  const firstResult = await getAdminDirectoryPage({ type, make, location, latitude, longitude }, requestedPage);
  const totalPages = Math.max(1, Math.ceil(firstResult.totalCount / ADMIN_DIRECTORY_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const result = page === requestedPage
    ? firstResult
    : await getAdminDirectoryPage({ type, make, location, latitude, longitude }, page);

  const vendors = dedupeVendors(
    result.rows
      .map((contact) => {
        const location = normalizePartnerLocation(contact);

        return {
          id: contact.id,
          name: contact.name,
          type: contact.type as DirectoryVendorType,
          address: location.location || formatCityState(contact.city, contact.state) || contact.location,
          city: location.city,
          state: location.state,
          postalCode: location.postalCode,
          phone: normalizePhoneNumber(contact.phone),
          email: contact.email,
          website: contact.website,
          makeSpecialization: contact.makeSpecialization,
          latitude: contact.latitude ?? getLocationCoordinates(contact.location)?.latitude ?? null,
          longitude: contact.longitude ?? getLocationCoordinates(contact.location)?.longitude ?? null,
          distanceMiles: contact.distanceMiles,
        };
      }),
  );

  return (
    <main className="page-shell wide">
      <section className="page-header admin-directory-header">
        <div>
          <div className="eyebrow">Admin Directory</div>
          <h1 className="page-title compact">Vendor Directory</h1>
          <p className="page-copy">
            Admin-only fulfillment contacts for dealers, service shops, transport providers, and insurance partners.
          </p>
        </div>
        <AdminDirectoryActions makeOptions={catalog.makes} />
      </section>

      <DirectoryTabs
        vendors={vendors}
        makeOptions={catalog.makes}
        activeTab={type}
        makeFilter={make}
        locationFilter={location}
        counts={result.counts}
      />
      <AdminPagination
        pathname="/admin/partners"
        page={page}
        totalPages={totalPages}
        preserveParams={{
          type,
          make,
          location,
          lat: latitude === undefined ? undefined : String(latitude),
          lng: longitude === undefined ? undefined : String(longitude),
        }}
        ariaLabel="Vendor directory pages"
      />
    </main>
  );
}

function parseCoordinate(value: string | undefined, min: number, max: number) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function dedupeVendors(vendors: DirectoryVendor[]) {
  const seen = new Map<string, DirectoryVendor>();

  for (const vendor of vendors) {
    const key = [
      vendor.type,
      normalize(vendor.name),
      normalize(vendor.email || ""),
      normalize(vendor.phone || ""),
      normalize(vendor.address || ""),
    ].join("|");

    if (!seen.has(key)) {
      seen.set(key, vendor);
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (a.type !== b.type) {
      return typeOrder(a.type) - typeOrder(b.type);
    }

    return a.name.localeCompare(b.name);
  });
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9@.]+/g, "");
}

function getLocationCoordinates(location?: string | null) {
  const key = location?.trim().toLowerCase();
  if (!key) return null;
  return cityCoordinates[key] ?? null;
}

const cityCoordinates: Record<string, { latitude: number; longitude: number }> = {
  "atlanta, ga": { latitude: 33.749, longitude: -84.388 },
  "austin, tx": { latitude: 30.2672, longitude: -97.7431 },
  "beverly hills, ca": { latitude: 34.0736, longitude: -118.4004 },
  "canton, mi": { latitude: 42.3086, longitude: -83.4821 },
  "cherry hill, nj": { latitude: 39.9268, longitude: -75.0246 },
  "chicago, il": { latitude: 41.8781, longitude: -87.6298 },
  "dallas, tx": { latitude: 32.7767, longitude: -96.797 },
  "davie, fl": { latitude: 26.0765, longitude: -80.2521 },
  "fort lauderdale, fl": { latitude: 26.1224, longitude: -80.1373 },
  "greenwich, ct": { latitude: 41.0262, longitude: -73.6282 },
  "horsham, pa": { latitude: 40.1784, longitude: -75.1284 },
  "houston, tx": { latitude: 29.7604, longitude: -95.3698 },
  "kings park, ny": { latitude: 40.8862, longitude: -73.2573 },
  "lebanon, mo": { latitude: 37.6806, longitude: -92.6638 },
  "los angeles, ca": { latitude: 34.0522, longitude: -118.2437 },
  "miami, fl": { latitude: 25.7617, longitude: -80.1918 },
  "new york, ny": { latitude: 40.7128, longitude: -74.006 },
  "newport beach, ca": { latitude: 33.6189, longitude: -117.9298 },
  "paramus, nj": { latitude: 40.9445, longitude: -74.0754 },
  "paterson, nj": { latitude: 40.9168, longitude: -74.1718 },
  "plainview, ny": { latitude: 40.7765, longitude: -73.4673 },
  "redwood city, ca": { latitude: 37.4852, longitude: -122.2364 },
  "sun valley, ca": { latitude: 34.2279, longitude: -118.3813 },
  "traverse city, mi": { latitude: 44.7631, longitude: -85.6206 },
  "tysons, va": { latitude: 38.9187, longitude: -77.2311 },
  "warren, ma": { latitude: 42.2126, longitude: -72.1912 },
  "west palm beach, fl": { latitude: 26.7153, longitude: -80.0534 },
  "white plains, ny": { latitude: 41.034, longitude: -73.7629 },
  "whitehouse station, nj": { latitude: 40.6154, longitude: -74.7707 },
};

function typeOrder(type: DirectoryVendorType) {
  switch (type) {
    case "DEALER":
      return 0;
    case "SERVICE_SHOP":
      return 1;
    case "TRANSPORTER":
      return 2;
    case "INSURER":
      return 3;
  }
}
