import { AdminMeetsTable, type AdminMeetRow } from "@/components/admin/AdminMeetsTable";
import { AdminMeetPhotoModeration, type AdminMeetPhotoRow } from "@/components/admin/AdminMeetPhotoModeration";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminMeetsPage() {
  const now = new Date();
  const [meets, photos] = await Promise.all([
    prisma.meet.findMany({
      include: {
        host: { select: { username: true, name: true, email: true } },
        _count: { select: { rsvps: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 200,
    }),
    prisma.meetPhoto.findMany({
      include: {
        meet: { select: { slug: true, title: true } },
        user: { select: { username: true, name: true, email: true } },
        vehicle: { include: { model: { include: { make: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  const activeMeetCount = meets.filter((meet) => ["PUBLISHED", "FULL"].includes(meet.status)).length;
  const upcomingMeetCount = meets.filter((meet) => ["PUBLISHED", "FULL"].includes(meet.status) && meet.startsAt >= now).length;
  const completedMeetCount = meets.filter((meet) => meet.status === "COMPLETED").length;
  const totalRsvps = meets.reduce((sum, meet) => sum + meet._count.rsvps, 0);
  const uniqueHosts = new Set(meets.map((meet) => meet.hostId)).size;
  const totalCapacity = meets.reduce((sum, meet) => sum + (meet.capacity || 0), 0);
  const meetKpis = [
    { label: "Active Meets", value: activeMeetCount.toLocaleString(), detail: `${upcomingMeetCount.toLocaleString()} upcoming` },
    { label: "Completed Meets", value: completedMeetCount.toLocaleString(), detail: "lifetime" },
    { label: "Total RSVPs", value: totalRsvps.toLocaleString(), detail: `${totalCapacity.toLocaleString()} listed capacity` },
    { label: "Active Hosts", value: uniqueHosts.toLocaleString(), detail: "unique organizers" },
    { label: "Meet Photos", value: photos.length.toLocaleString(), detail: "recent uploads" },
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
      <AdminMeetsTable meets={rows} referenceTimeIso={now.toISOString()} />
      <AdminMeetPhotoModeration photos={photoRows} />
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
