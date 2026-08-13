import { AdminMeetsTable, type AdminMeetRow } from "@/components/admin/AdminMeetsTable";
import { AdminMeetPhotoModeration, type AdminMeetPhotoRow } from "@/components/admin/AdminMeetPhotoModeration";
import { AdminPagination, parseAdminPage } from "@/components/admin/AdminPagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MEETS_PAGE_SIZE = 50;
const PHOTOS_PAGE_SIZE = 40;

export default async function AdminMeetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ meetPage?: string | string[]; photoPage?: string | string[] }>;
}) {
  const now = new Date();
  const resolvedSearchParams = await searchParams;
  const requestedMeetPage = parseAdminPage(resolvedSearchParams?.meetPage);
  const requestedPhotoPage = parseAdminPage(resolvedSearchParams?.photoPage);
  const [meetCount, photoCount] = await Promise.all([
    prisma.meet.count(),
    prisma.meetPhoto.count(),
  ]);
  const meetTotalPages = Math.max(1, Math.ceil(meetCount / MEETS_PAGE_SIZE));
  const photoTotalPages = Math.max(1, Math.ceil(photoCount / PHOTOS_PAGE_SIZE));
  const meetPage = Math.min(requestedMeetPage, meetTotalPages);
  const photoPage = Math.min(requestedPhotoPage, photoTotalPages);

  const [meets, photos, activeMeetCount, upcomingMeetCount, completedMeetCount, totalRsvps, capacity, hosts] = await Promise.all([
    prisma.meet.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        startsAt: true,
        city: true,
        state: true,
        type: true,
        visibility: true,
        status: true,
        capacity: true,
        createdAt: true,
        hostId: true,
        host: { select: { username: true, name: true, email: true } },
        _count: { select: { rsvps: true } },
      },
      orderBy: { startsAt: "desc" },
      skip: (meetPage - 1) * MEETS_PAGE_SIZE,
      take: MEETS_PAGE_SIZE,
    }),
    prisma.meetPhoto.findMany({
      select: {
        id: true,
        url: true,
        caption: true,
        createdAt: true,
        meet: { select: { slug: true, title: true } },
        user: { select: { username: true, name: true, email: true } },
        vehicle: {
          select: {
            vin: true,
            year: true,
            model: { select: { name: true, make: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (photoPage - 1) * PHOTOS_PAGE_SIZE,
      take: PHOTOS_PAGE_SIZE,
    }),
    prisma.meet.count({ where: { status: { in: ["PUBLISHED", "FULL"] } } }),
    prisma.meet.count({ where: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } } }),
    prisma.meet.count({ where: { status: "COMPLETED" } }),
    prisma.meetRsvp.count(),
    prisma.meet.aggregate({ _sum: { capacity: true } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(DISTINCT "hostId") AS count FROM "Meet"`,
  ]);

  const uniqueHosts = Number(hosts[0]?.count ?? 0);
  const totalCapacity = capacity._sum.capacity || 0;
  const meetKpis = [
    { label: "Active Meets", value: activeMeetCount.toLocaleString(), detail: `${upcomingMeetCount.toLocaleString()} upcoming` },
    { label: "Completed Meets", value: completedMeetCount.toLocaleString(), detail: "lifetime" },
    { label: "Total RSVPs", value: totalRsvps.toLocaleString(), detail: `${totalCapacity.toLocaleString()} listed capacity` },
    { label: "Active Hosts", value: uniqueHosts.toLocaleString(), detail: "unique organizers" },
    { label: "Meet Photos", value: photoCount.toLocaleString(), detail: "lifetime uploads" },
  ];

  const rows: AdminMeetRow[] = meets.map((meet) => ({
    id: meet.id,
    title: meet.title,
    href: `/meets/${meet.slug}`,
    host: meet.host.name || meet.host.username || meet.host.email || "Unknown host",
    date: `${formatDate(meet.startsAt)} ${formatTime(meet.startsAt)}`,
    startsAtIso: meet.startsAt.toISOString(),
    location: `${meet.city}, ${meet.state}`,
    city: meet.city,
    state: meet.state,
    type: meet.type,
    visibility: formatStatus(meet.visibility),
    rawStatus: meet.status,
    status: formatStatus(meet.status),
    capacity: meet.capacity,
    rsvpCount: meet._count.rsvps,
    createdAt: formatDate(meet.createdAt),
    createdAtIso: meet.createdAt.toISOString(),
  }));
  const photoRows: AdminMeetPhotoRow[] = photos.map((photo) => ({
    id: photo.id,
    url: photo.url,
    caption: photo.caption,
    meetTitle: photo.meet.title,
    meetHref: `/meets/${photo.meet.slug}`,
    userLabel: photo.user?.name || photo.user?.username || photo.user?.email || "Unknown member",
    vehicleLabel: photo.vehicle ? `${photo.vehicle.year} ${photo.vehicle.model.make.name} ${photo.vehicle.model.name}` : null,
    vehicleHref: photo.vehicle ? `/vehicle/${photo.vehicle.vin}` : null,
    createdAt: `${formatDate(photo.createdAt)} ${formatTime(photo.createdAt)}`,
  }));

  return (
    <main className="page-shell wide">
      <section className="admin-meet-kpi-grid" aria-label="Meet KPI summary">
        {meetKpis.map((kpi) => (
          <article key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.detail}</small>
          </article>
        ))}
      </section>
      <AdminMeetsTable meets={rows} totalCount={meetCount} referenceTimeIso={now.toISOString()} />
      <AdminPagination pathname="/admin/meets" pageParam="meetPage" page={meetPage} totalPages={meetTotalPages} preserveParams={{ photoPage: String(photoPage) }} ariaLabel="Meet pages" />
      <AdminMeetPhotoModeration photos={photoRows} />
      <AdminPagination pathname="/admin/meets" pageParam="photoPage" page={photoPage} totalPages={photoTotalPages} preserveParams={{ meetPage: String(meetPage) }} ariaLabel="Meet photo pages" />
    </main>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
