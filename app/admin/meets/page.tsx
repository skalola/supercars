import { AdminMeetsTable, type AdminMeetRow } from "@/components/admin/AdminMeetsTable";
import { AdminMeetPhotoModeration, type AdminMeetPhotoRow } from "@/components/admin/AdminMeetPhotoModeration";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminMeetsPage() {
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

  const rows: AdminMeetRow[] = meets.map((meet) => ({
    id: meet.id,
    title: meet.title,
    href: `/meets/${meet.slug}`,
    host: meet.host.name || meet.host.username || meet.host.email || "Unknown host",
    date: `${formatDate(meet.startsAt)} ${formatTime(meet.startsAt)}`,
    location: `${meet.city}, ${meet.state}`,
    type: meet.type,
    visibility: formatStatus(meet.visibility),
    status: formatStatus(meet.status),
    capacity: meet.capacity,
    rsvpCount: meet._count.rsvps,
    createdAt: formatDate(meet.createdAt),
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
      <AdminMeetsTable meets={rows} />
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
