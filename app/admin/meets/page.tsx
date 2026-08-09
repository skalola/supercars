import { AdminMeetsTable, type AdminMeetRow } from "@/components/admin/AdminMeetsTable";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminMeetsPage() {
  const meets = await prisma.meet.findMany({
    include: {
      host: { select: { username: true, name: true, email: true } },
      _count: { select: { rsvps: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 200,
  });

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

  return (
    <main className="page-shell wide">
      <AdminMeetsTable meets={rows} />
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
