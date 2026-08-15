import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { leaveClubAction, manageClubMemberAction, requestJoinClubAction, updateClubModelsAction, updateClubProfileAction } from "@/app/actions/clubs";
import { getCatalogMakeOptions } from "@/lib/makes/catalog";
import { getMeetTypeBadgeClass, normalizeMeetType } from "@/lib/meets/meet-types";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, buildPublicMetadata, privateMetadata, safeJsonLd } from "@/lib/seo";
import ClubConfirmButton from "../ClubConfirmButton";
import ClubEditModal from "../ClubEditModal";
import ClubInviteLink from "../ClubInviteLink";
import ClubLogoCropField from "../ClubLogoCropField";
import ClubModelSelector from "../ClubModelSelector";

export const dynamic = "force-dynamic";
const DEFAULT_CLUB_LOGO = "/images/supercar-dash-wordmark.svg";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.carClub.findUnique({
    where: { slug },
    select: { name: true, description: true, city: true, state: true, logoUrl: true, status: true, visibility: true },
  });
  if (!club || club.status !== "ACTIVE" || club.visibility !== "PUBLIC") return privateMetadata;
  const location = [club.city, club.state].filter(Boolean).join(", ");

  return buildPublicMetadata({
    title: `${club.name}${location ? ` | ${location}` : ""}`,
    description: (club.description || `Meet members, explore linked cars, and discover upcoming events from ${club.name}.`).slice(0, 160),
    path: `/clubs/${slug}`,
    image: club.logoUrl,
    keywords: [club.name, location ? `${location} car club` : "car club", "enthusiast car community"],
  });
}

function getClubDetailSelect(now = new Date()) {
  return {
  id: true,
  slug: true,
  name: true,
  logoUrl: true,
  city: true,
  state: true,
  visibility: true,
  description: true,
  creatorId: true,
  status: true,
  creator: { select: { id: true, name: true, username: true, image: true } },
  members: {
    where: { status: { in: ["ACTIVE", "PENDING"] } },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      user: { select: { id: true, name: true, username: true, image: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { joinedAt: "asc" }, { createdAt: "asc" }],
  },
  models: {
    select: {
      modelId: true,
      model: {
        select: {
          id: true,
          name: true,
          makeId: true,
          make: { select: { logoUrl: true } },
          images: {
            select: { url: true },
            orderBy: [{ type: "asc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  meets: {
    where: { status: { in: ["PUBLISHED", "FULL"] }, startsAt: { gte: now } },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      city: true,
      state: true,
      type: true,
    },
    orderBy: { startsAt: "asc" },
    take: 12,
  },
  } satisfies Prisma.CarClubSelect;
}

export default async function ClubDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [club, session] = await Promise.all([
    prisma.carClub.findUnique({
      where: { slug },
      select: getClubDetailSelect(),
    }),
    auth(),
  ]);

  if (!club || club.status !== "ACTIVE") {
    notFound();
  }

  const clubJsonLd = club.visibility === "PUBLIC" ? {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: club.name,
    description: club.description || undefined,
    url: absoluteUrl(`/clubs/${club.slug}`),
    logo: absoluteUrl(club.logoUrl || DEFAULT_CLUB_LOGO),
    location: club.city || club.state ? {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: club.city || undefined,
        addressRegion: club.state || undefined,
        addressCountry: "US",
      },
    } : undefined,
  } : null;

  const viewerUserId = session?.user?.id as string | undefined;
  const viewerMembership = viewerUserId ? club.members.find((member) => member.userId === viewerUserId) : null;
  const isAdmin = session?.user?.role === "ADMIN";
  const canModerate = Boolean(
    isAdmin ||
      (viewerMembership?.status === "ACTIVE" && ["OWNER", "MODERATOR"].includes(viewerMembership.role)),
  );
  const canInviteMembers = Boolean(isAdmin || viewerMembership?.status === "ACTIVE");
  const activeMembers = club.members.filter((member) => member.status === "ACTIVE");
  const pendingMembers = club.members.filter((member) => member.status === "PENDING");
  const memberUserIds = activeMembers.map((member) => member.userId);
  const [fastest, mostModified, makeOptions] = await Promise.all([
    getFastestClubCar(memberUserIds),
    getMostModifiedClubCar(memberUserIds),
    canModerate ? getCatalogMakeOptions() : Promise.resolve(null),
  ]);
  const nextMeet = club.meets[0] ?? null;
  const creatorName = club.creator.name || club.creator.username || "SUPERCAR DASH Member";
  const creatorHref = club.creator.username ? `/garage/${club.creator.username}` : null;
  const locationLabel = [club.city, club.state].filter(Boolean).join(", ");
  const heroImage = club.models[0]?.model.images[0]?.url || club.models[0]?.model.make.logoUrl || "/images/garage-home-hero.png?v=garage-2";

  return (
    <main className="club-detail-shell">
      {clubJsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(clubJsonLd) }} /> : null}
      <section className="club-detail-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.88), rgba(0,0,0,.32)), url("${heroImage}")` }}>
        <div>
          <Link href="/clubs" className="meet-back-link">&lt; Back to Clubs</Link>
          <div className="club-detail-title">
            <img className="club-detail-logo" src={club.logoUrl || DEFAULT_CLUB_LOGO} alt="" />
            <div>
              <h1>{club.name}</h1>
              <div className="club-detail-meta">
                {creatorHref ? (
                  <Link href={creatorHref} className="club-detail-creator">
                    {club.creator.image ? <img src={club.creator.image} alt="" referrerPolicy="no-referrer" /> : <span />}
                    <em>Created by {creatorName}</em>
                  </Link>
                ) : (
                  <span className="club-detail-creator">
                    {club.creator.image ? <img src={club.creator.image} alt="" referrerPolicy="no-referrer" /> : <span />}
                    <em>Created by {creatorName}</em>
                  </span>
                )}
                {locationLabel ? <span className="club-detail-location">{locationLabel}</span> : null}
              </div>
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
                null
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
        {fastest ? (
          <Link href={`/vehicle/${fastest.vin}`} className="club-stat-card is-clickable">
            <span>Fastest Car</span>
            <strong>{fastest.horsepower.toLocaleString()} hp</strong>
            <p>{fastest.label}</p>
          </Link>
        ) : (
          <div className="club-stat-card">
            <span>Fastest Car</span>
            <strong>Pending</strong>
            <p>No member horsepower logged yet</p>
          </div>
        )}
        {mostModified ? (
          <Link href={`/vehicle/${mostModified.vin}`} className="club-stat-card is-clickable">
            <span>Most Mods</span>
            <strong>{mostModified.modCount.toLocaleString()}</strong>
            <p>{mostModified.label}</p>
          </Link>
        ) : (
          <div className="club-stat-card">
            <span>Most Mods</span>
            <strong>Pending</strong>
            <p>No member modifications logged yet</p>
          </div>
        )}
        <div className="club-stat-card">
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
                      <span className={`meet-type-badge ${getMeetTypeBadgeClass(meet.type)}`}>{normalizeMeetType(meet.type)}</span>
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
          {canInviteMembers ? (
            <ClubInviteLink
              clubId={club.id}
              clubName={club.name}
              inviterName={userLabel(session?.user?.name, session?.user?.email)}
            />
          ) : null}
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
          {canModerate && makeOptions ? (
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
                <ClubLogoCropField initialLogoUrl={club.logoUrl} />
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
                  makes={makeOptions}
                  initialModels={club.models.map(({ model }) => ({
                    id: model.id,
                    name: model.name,
                    makeId: model.makeId,
                  }))}
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
  type FastestCarRow = { vin: string; year: number; makeName: string; modelName: string; horsepower: number };
  const [vehicle] = await prisma.$queryRaw<FastestCarRow[]>`
    SELECT
      vehicle."vin",
      vehicle."year",
      make."name" AS "makeName",
      model."name" AS "modelName",
      substring(COALESCE(vehicle."engineHP", spec."horsepower", '') from '[0-9]{2,4}')::integer AS "horsepower"
    FROM "Vehicle" vehicle
    INNER JOIN "Model" model ON model."id" = vehicle."modelId"
    INNER JOIN "Make" make ON make."id" = model."makeId"
    LEFT JOIN "ModelSpec" spec ON spec."modelId" = model."id"
    WHERE vehicle."ownerId" IN (${Prisma.join(userIds)})
      AND vehicle."status" = 'CLAIMED'
      AND substring(COALESCE(vehicle."engineHP", spec."horsepower", '') from '[0-9]{2,4}') IS NOT NULL
    ORDER BY "horsepower" DESC
    LIMIT 1
  `;
  return vehicle
    ? {
        vin: vehicle.vin,
        horsepower: Math.round(vehicle.horsepower),
        label: `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`,
      }
    : null;
}

async function getMostModifiedClubCar(userIds: string[]) {
  if (userIds.length === 0) return null;
  type MostModifiedRow = { vin: string; year: number; makeName: string; modelName: string; modCount: number };
  const [vehicle] = await prisma.$queryRaw<MostModifiedRow[]>`
    SELECT
      vehicle."vin",
      vehicle."year",
      make."name" AS "makeName",
      model."name" AS "modelName",
      (
        SELECT count(*) FROM "VehicleModification" modification
        WHERE modification."vehicleId" = vehicle."id"
      )::integer + (
        SELECT count(*) FROM "VehicleInstalledPart" installed
        WHERE installed."vehicleId" = vehicle."id"
      )::integer AS "modCount"
    FROM "Vehicle" vehicle
    INNER JOIN "Model" model ON model."id" = vehicle."modelId"
    INNER JOIN "Make" make ON make."id" = model."makeId"
    WHERE vehicle."ownerId" IN (${Prisma.join(userIds)})
      AND vehicle."status" = 'CLAIMED'
    ORDER BY "modCount" DESC
    LIMIT 1
  `;
  return vehicle && vehicle.modCount > 0
    ? {
        vin: vehicle.vin,
        modCount: vehicle.modCount,
        label: `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`,
      }
    : null;
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

function userLabel(name?: string | null, email?: string | null) {
  return name || email || "A SUPERCAR DASH member";
}
