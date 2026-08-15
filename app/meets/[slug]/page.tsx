import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { addMeetPhotoAction, manageMeetRsvpAction, updateHostedMeetAction } from "@/app/actions/meets";
import { HostCancelMeetForm } from "@/components/meets/HostCancelMeetForm";
import { getCatalogMakeOptions } from "@/lib/makes/catalog";
import { projectContiguousUsToPercent } from "@/lib/maps/us-projection";
import { getMeetTypeBadgeClass, MEET_TYPE_OPTIONS, normalizeMeetType } from "@/lib/meets/meet-types";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, buildPublicMetadata, privateMetadata, safeJsonLd, SITE_NAME } from "@/lib/seo";
import { CountryMapGraphic } from "../CountryMapGraphic";
import { getMeetBySlug } from "../meet-data";
import { AllowedMakesDropdown } from "../AllowedMakesDropdown";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const meet = await getMeetBySlug(slug);
  if (!meet || meet.status === "Invite Only" || meet.status === "Cancelled") return privateMetadata;

  return buildPublicMetadata({
    title: `${meet.title} | ${meet.city}, ${meet.state}`,
    description: `${meet.type} in ${meet.city}, ${meet.state} on ${meet.dateLabel}. ${meet.description}`.slice(0, 160),
    path: `/meets/${slug}`,
    image: meet.heroImage,
    type: "article",
    keywords: [meet.title, `${meet.city} car meet`, meet.type, ...meet.allowedMakes.slice(0, 5)],
  });
}

export default async function MeetDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [meet, session, makeOptions] = await Promise.all([getMeetBySlug(slug), auth(), getCatalogMakeOptions()]);

  if (!meet) {
    notFound();
  }

  const garageVehicles = session?.user?.id
    ? await prisma.vehicle.findMany({
        where: { ownerId: session.user.id as string, status: "CLAIMED" },
        select: {
          id: true,
          year: true,
          model: {
            select: {
              name: true,
              make: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }).catch(() => [])
    : [];
  const viewerUserId = session?.user?.id as string | undefined;
  const isHost = Boolean(meet.id && viewerUserId && meet.hostUserId === viewerUserId);
  const privateMeetContext = meet.id && viewerUserId
    ? await prisma.meet.findUnique({
        where: { id: meet.id },
        select: {
          id: true,
          title: true,
          type: true,
          startsAt: true,
          capacity: true,
          city: true,
          state: true,
          locationName: true,
          locationDetail: true,
          exactAddress: true,
          description: true,
          visibility: true,
          allowedMakes: true,
          clubId: true,
          hostId: true,
          rsvps: {
            where: isHost ? { status: { not: "CANCELLED" } } : { userId: viewerUserId, status: { in: ["GOING", "MAYBE", "WAITLISTED"] } },
            select: {
              id: true,
              userId: true,
              status: true,
              user: { select: { name: true, username: true, email: true } },
              vehicle: {
                select: {
                  year: true,
                  model: {
                    select: {
                      name: true,
                      make: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
            take: isHost ? 250 : 1,
          },
        },
      }).catch(() => null)
    : null;
  const canViewExactAddress = Boolean(
    privateMeetContext?.exactAddress &&
      viewerUserId &&
      (privateMeetContext.hostId === viewerUserId || privateMeetContext.rsvps.some((rsvp) => rsvp.userId === viewerUserId))
  );
  const displayedLocationDetail = canViewExactAddress && privateMeetContext?.exactAddress
    ? privateMeetContext.exactAddress
    : meet.locationDetail;
  const mapPoint = meet.latitude !== null && meet.longitude !== null
    ? projectContiguousUsToPercent(meet.latitude, meet.longitude)
    : { x: meet.mapX, y: meet.mapY };
  const hostableClubs = isHost && viewerUserId
    ? await prisma.carClub.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { creatorId: viewerUserId },
            {
              members: {
                some: {
                  userId: viewerUserId,
                  status: "ACTIVE",
                  role: { in: ["OWNER", "MODERATOR"] },
                },
              },
            },
          ],
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, city: true, state: true },
      }).catch(() => [])
    : [];
  const attendeeRows = isHost ? privateMeetContext?.rsvps || [] : [];
  const attendeeCsv = buildRosterCsv(attendeeRows);
  const eventJsonLd = meet.status === "Invite Only" ? null : {
    "@context": "https://schema.org",
    "@type": "Event",
    name: meet.title,
    description: meet.description,
    startDate: meet.startsAt,
    eventStatus: meet.status === "Cancelled"
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: [absoluteUrl(meet.heroImage)],
    location: {
      "@type": "Place",
      name: meet.locationName,
      address: {
        "@type": "PostalAddress",
        addressLocality: meet.city,
        addressRegion: meet.state,
        addressCountry: "US",
      },
    },
    organizer: {
      "@type": "Organization",
      name: meet.club?.name || SITE_NAME,
      url: meet.club ? absoluteUrl(`/clubs/${meet.club.slug}`) : absoluteUrl("/meets"),
    },
  };

  return (
    <main className="meet-detail-shell">
      {eventJsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(eventJsonLd) }} /> : null}
      <section className="meet-detail-hero">
        <div className="meet-detail-hero-copy">
          <Link href="/meets" className="meet-back-link">
            &lt; Back to Meets
          </Link>
          <span className={`meet-type-badge ${getMeetTypeBadgeClass(meet.type)}`}>{normalizeMeetType(meet.type)}</span>
          <h1>{meet.title}</h1>
          <p>{meet.description}</p>
          <div className="meet-detail-actions">
            <Link href="#cars" className="meets-primary-button">
              Cars Attending
            </Link>
          </div>
          {meet.club ? (
            <Link href={`/clubs/${meet.club.slug}`} className="meet-club-hero-badge">
              <span>Hosted by Club</span>
              <strong>{meet.club.name}</strong>
            </Link>
          ) : null}
        </div>
        <aside className="meet-status-card">
          <span>{meet.status}</span>
          <strong>
            {meet.dateLabel} · {meet.timeLabel}
          </strong>
          <p>
            {meet.city}, {meet.state}
          </p>
          {isHost ? (
            <HostCancelMeetForm meetId={meet.id || ""} meetTitle={meet.title} />
          ) : null}
        </aside>
      </section>

      <section className="meet-detail-layout">
        <article className="meet-info-panel">
          <div className="meets-panel-title">
            <span>Location</span>
            <strong>{meet.locationName}</strong>
          </div>
          <div className="meet-location-map">
            <CountryMapGraphic countryCode="US">
              <span
                className="meet-location-pin"
                style={{ left: `${mapPoint.x}%`, top: `${mapPoint.y}%` }}
                aria-label={`${meet.title} in ${meet.city}, ${meet.state}`}
              />
            </CountryMapGraphic>
          </div>
          <p>{displayedLocationDetail}</p>
          {privateMeetContext?.exactAddress ? (
            <p className="meet-private-note">
              {canViewExactAddress ? "Exact address visible to host and active RSVPs." : "Exact address unlocks after RSVP approval."}
            </p>
          ) : null}
          <div className="meet-info-grid">
            <div>
              <span>Host</span>
              <strong>{meet.host}</strong>
            </div>
            {meet.club ? (
              <div>
                <span>Club</span>
                <strong>
                  <Link href={`/clubs/${meet.club.slug}`}>{meet.club.name}</Link>
                </strong>
              </div>
            ) : null}
            <div>
              <span>Expected Cars</span>
              <strong>{meet.expectedCars}</strong>
            </div>
            <div>
              <span>Allowed Makes</span>
              <strong>{meet.allowedMakes.join(" · ")}</strong>
            </div>
          </div>
        </article>

        <article id="cars" className="meet-cars-panel">
          <div className="meets-panel-title">
            <span>Roll Call</span>
            <strong>Cars Attending</strong>
          </div>
          <div className="meet-car-grid">
            {meet.cars.map((car) => (
              <Link key={`${car.owner}:${car.name}`} href={car.ownerHref} className="meet-car-card">
                <div className="meet-car-image" style={{ backgroundImage: `url("${car.image}")` }} />
                <div>
                  <span>{car.owner}</span>
                  <strong>{car.name}</strong>
                </div>
              </Link>
            ))}
          </div>
        </article>

        {isHost && privateMeetContext ? (
          <article id="host-tools" className="meet-host-tools-panel">
            <div className="meets-panel-title">
              <span>Host Console</span>
              <strong>Edit Meet</strong>
            </div>

            <form action={updateHostedMeetAction} className="meet-host-form is-compact">
              <input type="hidden" name="meetId" value={privateMeetContext.id} />
              <div className="meet-host-grid">
                <label>
                  <span>Event Name</span>
                  <input name="title" defaultValue={privateMeetContext.title} required />
                </label>
                <label>
                  <span>Format</span>
                  <select name="type" defaultValue={normalizeMeetType(privateMeetContext.type)}>
                    {MEET_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Date & Time</span>
                  <input name="startsAt" type="datetime-local" defaultValue={formatDateTimeLocal(privateMeetContext.startsAt)} required />
                </label>
                <label>
                  <span>Capacity</span>
                  <input name="capacity" type="number" min="1" defaultValue={privateMeetContext.capacity || ""} />
                </label>
                <label>
                  <span>City</span>
                  <input name="city" defaultValue={privateMeetContext.city} required />
                </label>
                <label>
                  <span>State</span>
                  <input name="state" defaultValue={privateMeetContext.state} maxLength={2} required />
                </label>
                <label>
                  <span>Location Name</span>
                  <input name="locationName" defaultValue={privateMeetContext.locationName} required />
                </label>
                <label>
                  <span>Location Privacy</span>
                  <select name="visibility" defaultValue={privateMeetContext.visibility}>
                    <option value="PUBLIC">Public</option>
                    <option value="INVITE_ONLY">Invite Only</option>
                  </select>
                </label>
                <label>
                  <span>Club</span>
                  <select name="clubId" defaultValue={privateMeetContext.clubId || ""}>
                    <option value="">No club attached</option>
                    {hostableClubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name} · {club.city}, {club.state}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Public Location Note</span>
                <input name="locationDetail" defaultValue={privateMeetContext.locationDetail || ""} />
              </label>
              <label>
                <span>Exact Address</span>
                <input name="exactAddress" defaultValue={privateMeetContext.exactAddress || ""} />
              </label>
              <label>
                <span>Description</span>
                <textarea name="description" rows={4} defaultValue={privateMeetContext.description || ""} />
              </label>
              <AllowedMakesDropdown
                makes={makeOptions}
                defaultSelectedNames={parseAllowedMakes(privateMeetContext.allowedMakes)}
              />
              <div className="meet-host-actions">
                <button type="submit">Save Changes</button>
              </div>
            </form>

            <div id="attendees" className="meet-attendee-panel">
              <div className="meets-panel-title">
                <span>Roster</span>
                <strong>Attendee Management</strong>
              </div>
              {attendeeRows.length > 0 ? (
                <>
                  <a
                    className="meets-secondary-button"
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(attendeeCsv)}`}
                    download={`${meet.slug}-roster.csv`}
                  >
                    Export Roster
                  </a>
                  <div className="meet-attendee-list">
                    {attendeeRows.map((rsvp) => (
                      <div key={rsvp.id} className="meet-attendee-row">
                        <div>
                          <strong>{rsvp.user.name || rsvp.user.username || rsvp.user.email || "Member"}</strong>
                          <span>
                            {rsvp.vehicle
                              ? `${rsvp.vehicle.year} ${rsvp.vehicle.model.make.name} ${rsvp.vehicle.model.name}`
                              : "No vehicle selected"}
                          </span>
                        </div>
                        <span className="meet-attendee-status">{formatStatus(rsvp.status)}</span>
                        <form action={manageMeetRsvpAction}>
                          <input type="hidden" name="rsvpId" value={rsvp.id} />
                          <button type="submit" name="action" value="GOING">Approve</button>
                          <button type="submit" name="action" value="WAITLISTED">Waitlist</button>
                          <button type="submit" name="action" value="REMOVE">Remove</button>
                        </form>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="meet-empty-note">No attendees yet.</p>
              )}
            </div>
          </article>
        ) : null}

        <article id="photos" className="meet-photos-panel">
          <div className="meets-panel-title">
            <span>Event History</span>
            <strong>Photo Gallery</strong>
          </div>

          {meet.photos.length > 0 ? (
            <div className="meet-photo-grid">
              {meet.photos.map((photo) => (
                <figure key={photo.id} className="meet-photo-card">
                  <div className="meet-photo-image" style={{ backgroundImage: `url("${photo.url}")` }} />
                  <figcaption>
                    <span>{photo.owner}</span>
                    {photo.vehicleHref && photo.vehicleLabel ? (
                      <Link href={photo.vehicleHref}>{photo.vehicleLabel}</Link>
                    ) : null}
                    {photo.caption ? <p>{photo.caption}</p> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="meet-empty-note">
              {meet.status === "Completed"
                ? "No photos have been added yet."
                : "Photo history opens when the meet is completed."}
            </p>
          )}

          {meet.id && session?.user?.id && meet.status === "Completed" ? (
            <form action={addMeetPhotoAction} className="meet-photo-form">
              <input type="hidden" name="meetId" value={meet.id} />
              <label>
                <span>Upload Photo</span>
                <input type="file" name="photoFile" accept="image/jpeg,image/png,image/webp" />
              </label>
              <label>
                <span>Vehicle</span>
                <select name="vehicleId" defaultValue="">
                  <option value="">No vehicle tag</option>
                  {garageVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.year} {vehicle.model.make.name} {vehicle.model.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="meet-photo-caption-field">
                <span>Caption</span>
                <input name="caption" maxLength={180} placeholder="Optional event note" />
              </label>
              <label className="meet-photo-url-field">
                <span>Photo URL</span>
                <input type="url" name="photoUrl" placeholder="Optional fallback URL" />
              </label>
              <button type="submit">Add Photo</button>
            </form>
          ) : null}
        </article>
      </section>
    </main>
  );
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseAllowedMakes(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return ["Ferrari", "Lamborghini", "McLaren"];
  }
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function buildRosterCsv(rows: Array<{
  status: string;
  user: { name: string | null; username: string | null; email: string | null };
  vehicle: { year: number | null; model: { name: string; make: { name: string } } } | null;
}>) {
  const header = ["Name", "Username", "Email", "Status", "Vehicle"];
  const lines = rows.map((row) => [
    row.user.name || "",
    row.user.username || "",
    row.user.email || "",
    formatStatus(row.status),
    row.vehicle ? `${row.vehicle.year || ""} ${row.vehicle.model.make.name} ${row.vehicle.model.name}`.trim() : "",
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
