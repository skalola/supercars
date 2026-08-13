import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { AdminUsersTable, AdminUserRow } from "@/components/admin/AdminUsersTable";
import { AdminPagination, parseAdminPage } from "@/components/admin/AdminPagination";

const USERS_PAGE_SIZE = 50;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const session = await requireAdmin();
  const now = new Date();
  const requestedPage = parseAdminPage((await searchParams)?.page);

  const totalUsers = await prisma.user.count();
  const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
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
    skip: (page - 1) * USERS_PAGE_SIZE,
    take: USERS_PAGE_SIZE,
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
      <AdminUsersTable users={rows} totalCount={totalUsers} />
      <AdminPagination pathname="/admin/users" page={page} totalPages={totalPages} />
    </main>
  );
}
