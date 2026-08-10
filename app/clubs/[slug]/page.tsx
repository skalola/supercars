import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { leaveClubAction, manageClubMemberAction, requestJoinClubAction, updateClubModelsAction, updateClubProfileAction } from "@/app/actions/clubs";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";
import { prisma } from "@/lib/prisma";
import ClubConfirmButton from "../ClubConfirmButton";
import ClubEditModal from "../ClubEditModal";
import ClubModelSelector from "../ClubModelSelector";

export const dynamic = "force-dynamic";
const DEFAULT_CLUB_LOGO = "/images/supercar-dash-wordmark.svg";

export default async function ClubDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [club, session, catalog] = await Promise.all([
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
          where: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 12,
        },
      },
    }),
    auth(),
    getMakeModelCatalogOptions(),
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
  const memberUserIds = activeMembers.map((member) => member.userId);
  const [fastest, mostModified] = await Promise.all([
    getFastestClubCar(memberUserIds),
    getMostModifiedClubCar(memberUserIds),
  ]);
  const nextMeet = club.meets[0] ?? null;
  const heroImage = club.models[0]?.model.images[0]?.url || club.models[0]?.model.make.logoUrl || "/images/garage-home-hero.png?v=garage-2";

  return (
    <main className="club-detail-shell">
      <section className="club-detail-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.88), rgba(0,0,0,.32)), url("${heroImage}")` }}>
        <div>
          <Link href="/clubs" className="meet-back-link">&lt; Back to Clubs</Link>
          <div className="club-detail-title">
            <img className="club-detail-logo" src={club.logoUrl || DEFAULT_CLUB_LOGO} alt="" />
            <div>
              <h1>{club.name}</h1>
              <span className="club-detail-location">{club.city}, {club.state}</span>
            </div>
          </div>
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
          <span>Fastest Car</span>
          <strong>{fastest ? `${fastest.horsepower.toLocaleString()} hp` : "Pending"}</strong>
          <p>{fastest?.label || "No member horsepower logged yet"}</p>
        </div>
        <div>
          <span>Most Mods</span>
          <strong>{mostModified ? mostModified.modCount.toLocaleString() : "Pending"}</strong>
          <p>{mostModified?.label || "No member modifications logged yet"}</p>
        </div>
        <div>
          <span>Next Event Date</span>
          <strong>{nextMeet ? formatMeetDay(nextMeet.startsAt) : "Pending"}</strong>
          <p>{nextMeet ? nextMeet.title : "No upcoming club meets"}</p>
        </div>
      </section>

      <section className="club-detail-layout">
        <div className="club-detail-main">
          <article className="club-panel">
            <div className="meets-panel-title">
              <span>Club Meets</span>
              <strong>Upcoming Events</strong>
            </div>
            <div className="club-meet-list is-primary">
              {club.meets.length > 0 ? (
                club.meets.map((meet) => (
                  <Link key={meet.id} href={`/meets/${meet.slug}`} className="club-meet-row">
                    <time dateTime={meet.startsAt.toISOString()}>{formatMeetDate(meet.startsAt)}</time>
                    <div>
                      <strong>{meet.title}</strong>
                      <p>{meet.city}, {meet.state}</p>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="meet-empty-note">No upcoming club-hosted meets yet.</p>
              )}
            </div>
          </article>

        </div>

        <aside id="members" className="club-panel club-members-widget">
          <div className="meets-panel-title">
            <span>Garage Roster</span>
            <strong>
              Members
              <em className="club-member-count">{activeMembers.length}</em>
            </strong>
          </div>
          <div className="club-member-grid">
            {activeMembers.map((member) => (
              <Link key={member.id} href={member.user.username ? `/garage/${member.user.username}` : "/garage"} className="club-member-card">
                {member.user.image ? <img src={member.user.image} alt="" referrerPolicy="no-referrer" /> : <span />}
                <div>
                  <strong>{member.user.name || member.user.username || "SUPERCAR DASH Member"}</strong>
                  <p>{member.role === "OWNER" ? "Club Owner" : member.role === "MODERATOR" ? "Moderator" : "Member"}</p>
                </div>
              </Link>
            ))}
          </div>
          {pendingMembers.length > 0 && canModerate ? (
            <p className="club-widget-note">{pendingMembers.length} pending {pendingMembers.length === 1 ? "request" : "requests"}</p>
          ) : null}
          {canModerate ? (
            <ClubEditModal>
              <form action={updateClubProfileAction} className="club-form">
                <input type="hidden" name="clubId" value={club.id} />
                <div className="meets-panel-title">
                  <span>Club Profile</span>
                  <strong>Edit Details</strong>
                </div>
                <label>
                  <span>Club Name</span>
                  <input name="name" defaultValue={club.name} required />
                </label>
                <div className="club-form-grid">
                  <label>
                    <span>City</span>
                    <input name="city" defaultValue={club.city || ""} required />
                  </label>
                  <label>
                    <span>State</span>
                    <input name="state" defaultValue={club.state || ""} maxLength={2} required />
                  </label>
                </div>
                <label>
                  <span>Visibility</span>
                  <select name="visibility" defaultValue={club.visibility}>
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private Approval</option>
                  </select>
                </label>
                <label>
                  <span>Club Logo</span>
                  <input name="logoFile" type="file" accept="image/jpeg,image/png,image/webp" />
                </label>
                <label>
                  <span>Description</span>
                  <textarea name="description" rows={4} defaultValue={club.description || ""} />
                </label>
                <button type="submit">Save Club</button>
              </form>

              <form action={updateClubModelsAction} className="club-form">
                <input type="hidden" name="clubId" value={club.id} />
                <div className="meets-panel-title">
                  <span>Model Links</span>
                  <strong>Edit Makes & Models</strong>
                </div>
                <ClubModelSelector
                  makes={catalog.makes}
                  models={catalog.models}
                  initialModelIds={club.models.map(({ modelId }) => modelId)}
                />
                <button type="submit">Save Models</button>
              </form>

              <section className="club-edit-section">
                <div className="meets-panel-title">
                  <span>Members</span>
                  <strong>Requests & Roles</strong>
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
                          <ClubConfirmButton name="action" value="DECLINE" message="Decline this club request?">
                            Decline
                          </ClubConfirmButton>
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
                          {member.role === "MODERATOR" ? (
                            <ClubConfirmButton name="action" value="DEMOTE" message="Demote this moderator to member?">
                              Demote
                            </ClubConfirmButton>
                          ) : (
                            <ClubConfirmButton name="action" value="PROMOTE" message="Promote this member to moderator?">
                              Promote
                            </ClubConfirmButton>
                          )}
                          <ClubConfirmButton name="action" value="REMOVE" message="Remove this member from the club?">
                            Remove
                          </ClubConfirmButton>
                        </form>
                      </div>
                    ))}
                </div>
              </section>
            </ClubEditModal>
          ) : null}
        </aside>
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

async function getMostModifiedClubCar(userIds: string[]) {
  if (userIds.length === 0) return null;
  const vehicles = await prisma.vehicle.findMany({
    where: { ownerId: { in: userIds }, status: "CLAIMED" },
    include: {
      model: { include: { make: true } },
      modifications: { select: { id: true } },
    },
    take: 250,
  });

  return vehicles
    .map((vehicle) => ({
      modCount: vehicle.modifications.length,
      label: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
    }))
    .filter((item) => item.modCount > 0)
    .sort((a, b) => b.modCount - a.modCount)[0] ?? null;
}

function formatMeetDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatMeetDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function parseHorsepower(value: string | null | undefined) {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d{2,4})/);
  return match ? Number(match[1]) : null;
}
