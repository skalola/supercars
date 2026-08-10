import Link from "next/link";
import { adminDeleteClubAction, adminHideClubAction, adminTransferClubAction } from "@/app/actions/admin-clubs";
import ClubConfirmButton from "@/app/clubs/ClubConfirmButton";
import { requireAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminClubsPage() {
  await requireAdmin();

  const clubs = await prisma.carClub.findMany({
    include: {
      creator: { select: { id: true, name: true, username: true, email: true } },
      members: {
        where: { status: "ACTIVE" },
        include: { user: { select: { id: true, name: true, username: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
      _count: {
        select: {
          members: { where: { status: "ACTIVE" } },
          models: true,
          meets: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 120,
  });

  return (
    <main className="page-shell wide">
      <section className="page-header admin-directory-header">
        <div>
          <div className="eyebrow">Admin Clubs</div>
          <h1 className="page-title compact">Club Oversight</h1>
          <p className="page-copy">Review clubs, transfer ownership, hide bad actors, or permanently remove test clubs.</p>
        </div>
        <Link href="/clubs" className="garage-secondary-button">Open Clubs</Link>
      </section>

      <section className="admin-club-grid">
        {clubs.map((club) => (
          <article key={club.id} className="admin-club-card">
            <div className="admin-club-card-header">
              <div>
                <span>{club.status}</span>
                <h2>{club.name}</h2>
                <p>{[club.city, club.state].filter(Boolean).join(", ") || "Location pending"}</p>
              </div>
              <Link href={`/clubs/${club.slug}`}>View</Link>
            </div>

            <div className="admin-club-metrics">
              <div>
                <span>Members</span>
                <strong>{club._count.members}</strong>
              </div>
              <div>
                <span>Models</span>
                <strong>{club._count.models}</strong>
              </div>
              <div>
                <span>Meets</span>
                <strong>{club._count.meets}</strong>
              </div>
            </div>

            <div className="admin-club-owner">
              <span>Owner</span>
              <strong>{club.creator.name || club.creator.username || club.creator.email || "Unknown"}</strong>
            </div>

            <form action={adminTransferClubAction} className="admin-club-transfer">
              <input type="hidden" name="clubId" value={club.id} />
              <label>
                <span>Transfer Owner</span>
                <select name="userId" defaultValue="">
                  <option value="">Choose active member</option>
                  {club.members
                    .filter((member) => member.userId !== club.creatorId)
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.name || member.user.username || member.user.email || "Member"}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit">Transfer</button>
            </form>

            <div className="admin-club-actions">
              {club.status === "ACTIVE" ? (
                <form action={adminHideClubAction}>
                  <input type="hidden" name="clubId" value={club.id} />
                  <ClubConfirmButton name="intent" value="hide" message="Hide this club from public discovery?">
                    Hide
                  </ClubConfirmButton>
                </form>
              ) : null}
              <form action={adminDeleteClubAction}>
                <input type="hidden" name="clubId" value={club.id} />
                <ClubConfirmButton name="intent" value="delete" message="Permanently delete this club and memberships?">
                  Delete
                </ClubConfirmButton>
              </form>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
