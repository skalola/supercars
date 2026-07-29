import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { AdminUsersTable, AdminUserRow } from "@/components/admin/AdminUsersTable";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function AdminUsersPage() {
  const session = await requireAdmin();
  const now = new Date();

  const users = await prisma.user.findMany({
    include: {
      sessions: {
        where: { expires: { gt: now } },
        select: { id: true },
      },
      _count: {
        select: {
          vehicles: true,
          listings: true,
          fulfillmentRequests: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: AdminUserRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: formatDate(user.createdAt),
    activeSessionCount: user.sessions.length,
    vehicleCount: user._count.vehicles,
    listingCount: user._count.listings,
    fulfillmentCount: user._count.fulfillmentRequests,
    isCurrentAdmin: user.id === session.user?.id,
  }));

  return (
    <main className="page-shell wide">
      <AdminUsersTable users={rows} />
    </main>
  );
}
