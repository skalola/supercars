import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { leaveClubAction, manageClubMemberAction, requestJoinClubAction } from "@/app/actions/clubs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [club, session] = await Promise.all([
    prisma.carClub.findUnique({
      where: { slug },
      include: {
        creator: { select: { id: true, name: true, username: true, image: true } },
        members: {
          where: { status: { in: ["ACTIVE", "PENDING"] } },
          include: { user: { select: { id: true, name: true, username: true, image: true, email: true } } },
          orderBy: [{ status: "asc" }, { joinedAt: "asc" }, { createdAt: "asc" }],
        },
        models: {
          include: { model: { include: { make: true, images: { take: 1 }, spec: true } } },
          orderBy: { createdAt: "asc" },
        },
        meets: {
          where: { status: { in: ["PUBLISHED", "FULL", "COMPLETED"] } },
          orderBy: { startsAt: "asc" },
          take: 8,
        },
      },
    }),
    auth(),
  ]);

  if (!club || club.status !== "ACTIVE") {
    notFound();
  }

  const viewerUserId = session?.user?.id as string | undefined;
  const viewerMembership = viewerUserId ? club.members.find((member) => member.userId === viewerUserId) : null;
  const isAdmin = session?.user?.role === "ADMIN";
  const canModerate = Boolean(
    isAdmin ||
      (viewerMembership?.status === "ACTIVE" && ["OWNER", "MODERATOR"].includes(viewerMembership.role)),
  );
  const activeMembers = club.members.filter((member) => member.status === "ACTIVE");
  const pendingMembers = club.members.filter((member) => member.status === "PENDING");
  const fastest = await getFastestClubCar(activeMembers.map((member) => member.userId));
  const heroImage = club.models[0]?.model.images[0]?.url || club.models[0]?.model.make.logoUrl || "/images/garage-home-hero.png?v=garage-2";

  return (
    <main className="club-detail-shell">
      <section className="club-detail-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.88), rgba(0,0,0,.32)), url("${heroImage}")` }}>
        <div>
          <Link href="/clubs" className="meet-back-link">&lt; Back to Clubs</Link>
          <span>{club.city}, {club.state}</span>
          <h1>{club.name}</h1>
          <p>{club.description || "A SUPERCAR DASH driver club connected to model pages, public meets, and member garages."}</p>
          <div className="club-detail-actions">
            {viewerUserId ? (
              viewerMembership?.status === "ACTIVE" && club.creatorId !== viewerUserId ? (
                <form action={leaveClubAction}>
                  <input type="hidden" name="clubId" value={club.id} />
                  <button type="submit" className="meets-secondary-button">Leave Club</button>
                </form>
              ) : viewerMembership?.status === "PENDING" ? (
                <span className="club-status-pill">Request Pending</span>
              ) : viewerMembership?.status === "ACTIVE" ? (
                <span className="club-status-pill">Member</span>
              ) : (
                <form action={requestJoinClubAction}>
                  <input type="hidden" name="clubId" value={club.id} />
                  <button type="submit" className="meets-primary-button">Join Club</button>
                </form>
              )
            ) : (
              <Link href="/login" className="meets-primary-button">Sign In to Join</Link>
            )}
            <Link href={`/meets/host?club=${club.slug}`} className="meets-secondary-button">Host a Meet</Link>
          </div>
        </div>
      </section>

      <section className="club-stat-grid">
        <div>
          <span>Total Members</span>
          <strong>{activeMembers.length}</strong>
        </div>
        <div>
          <span>Location</span>
          <strong>{club.city}, {club.state}</strong>
        </div>
        <div>
          <span>Fastest Car</span>
          <strong>{fastest ? `${fastest.horsepower.toLocaleString()} hp` : "Pending"}</strong>
          <p>{fastest?.label || "No member horsepower logged yet"}</p>
        </div>
        <div>
          <span>Linked Models</span>
          <strong>{club.models.length}</strong>
        </div>
      </section>

      <section className="club-detail-layout">
        <article className="club-panel">
          <div className="meets-panel-title">
            <span>Model Network</span>
            <strong>Cars This Club Follows</strong>
          </div>
          <div className="club-model-grid">
            {club.models.length > 0 ? (
              club.models.map(({ model }) => (
                <Link key={model.id} href={`/make/${model.make.slug}/${model.slug}`} className="club-model-card">
                  <div style={{ backgroundImage: `url("${model.images[0]?.url || model.make.logoUrl || "/images/garage-home-hero.png?v=garage-2"}")` }} />
                  <span>{model.make.name}</span>
                  <strong>{model.name}</strong>
                </Link>
              ))
            ) : (
              <p className="meet-empty-note">No linked models yet.</p>
            )}
          </div>
        </article>

        <article className="club-panel">
          <div className="meets-panel-title">
            <span>Meet Link</span>
            <strong>Club Events</strong>
          </div>
          <div className="club-meet-list">
            {club.meets.length > 0 ? (
              club.meets.map((meet) => (
                <Link key={meet.id} href={`/meets/${meet.slug}`} className="club-meet-row">
                  <span>{meet.city}, {meet.state}</span>
                  <strong>{meet.title}</strong>
                  <p>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(meet.startsAt)}</p>
                </Link>
              ))
            ) : (
              <p className="meet-empty-note">No club-hosted meets yet.</p>
            )}
          </div>
        </article>

        <article id="members" className="club-panel is-wide">
          <div className="meets-panel-title">
            <span>Garage Roster</span>
            <strong>Members</strong>
          </div>
          <div className="club-member-grid">
            {activeMembers.map((member) => (
              <Link key={member.id} href={member.user.username ? `/garage/${member.user.username}` : "/garage"} className="club-member-card">
                {member.user.image ? <img src={member.user.image} alt="" referrerPolicy="no-referrer" /> : <span />}
                <div>
                  <strong>{member.user.name || member.user.username || "SUPERCAR DASH Member"}</strong>
                  <p>{member.role === "OWNER" ? "Club Owner" : "Member"}</p>
                </div>
              </Link>
            ))}
          </div>
        </article>

        {canModerate ? (
          <article className="club-panel is-wide">
            <div className="meets-panel-title">
              <span>Moderator Console</span>
              <strong>Membership Requests</strong>
            </div>
            {pendingMembers.length > 0 ? (
              <div className="club-moderation-list">
                {pendingMembers.map((member) => (
                  <div key={member.id} className="club-moderation-row">
                    <div>
                      <strong>{member.user.name || member.user.username || member.user.email || "Member"}</strong>
                      <span>Pending approval</span>
                    </div>
                    <form action={manageClubMemberAction}>
                      <input type="hidden" name="memberId" value={member.id} />
                      <button type="submit" name="action" value="APPROVE">Approve</button>
                      <button type="submit" name="action" value="DECLINE">Decline</button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="meet-empty-note">No pending requests.</p>
            )}

            <div className="club-moderation-list">
              {activeMembers
                .filter((member) => member.userId !== club.creatorId)
                .map((member) => (
                  <div key={member.id} className="club-moderation-row">
                    <div>
                      <strong>{member.user.name || member.user.username || member.user.email || "Member"}</strong>
                      <span>{member.role}</span>
                    </div>
                    <form action={manageClubMemberAction}>
                      <input type="hidden" name="memberId" value={member.id} />
                      <button type="submit" name="action" value="REMOVE">Remove</button>
                    </form>
                  </div>
                ))}
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}

async function getFastestClubCar(userIds: string[]) {
  if (userIds.length === 0) return null;
  const vehicles = await prisma.vehicle.findMany({
    where: { ownerId: { in: userIds }, status: "CLAIMED" },
    include: { model: { include: { make: true, spec: true } } },
    take: 250,
  });
  return vehicles
    .map((vehicle) => {
      const horsepower = parseHorsepower(vehicle.engineHP) ?? parseHorsepower(vehicle.model.spec?.horsepower);
      return horsepower
        ? {
            horsepower,
            label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
          }
        : null;
    })
    .filter((item): item is { horsepower: number; label: string } => Boolean(item))
    .sort((a, b) => b.horsepower - a.horsepower)[0] ?? null;
}

function parseHorsepower(value: string | null | undefined) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d{2,4})/);
  return match ? Number(match[1]) : null;
}
