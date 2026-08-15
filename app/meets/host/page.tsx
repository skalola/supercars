import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createMeetAction } from "@/app/actions/meets";
import { getCatalogMakeOptions } from "@/lib/makes/catalog";
import { MEET_TYPE_OPTIONS } from "@/lib/meets/meet-types";
import { prisma } from "@/lib/prisma";
import { AllowedMakesDropdown } from "../AllowedMakesDropdown";

export const dynamic = "force-dynamic";

export default async function HostMeetPage({ searchParams }: { searchParams?: Promise<{ club?: string }> }) {
  const resolvedSearchParams = (await searchParams) || {};
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id as string;
  const [makes, hostableClubs] = await Promise.all([
    getCatalogMakeOptions(),
    prisma.carClub.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { creatorId: userId },
          {
            members: {
              some: {
                userId,
                status: "ACTIVE",
                role: { in: ["OWNER", "MODERATOR"] },
              },
            },
          },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, city: true, state: true },
    }).catch(() => []),
  ]);
  const selectedClubId = hostableClubs.find((club) => club.slug === resolvedSearchParams.club || club.id === resolvedSearchParams.club)?.id || "";

  return (
    <main className="meet-detail-shell">
      <section className="meet-host-hero">
        <div>
          <Link href="/meets" className="meet-back-link">
            &lt; Back to Meets
          </Link>
          <span>Host Layer</span>
          <h1>Host a meet.</h1>
          <p>Create a public meet or invite-only drive. RSVPs can attach a claimed garage car so attendance becomes part of the ownership story.</p>
        </div>
      </section>

      <form action={createMeetAction} className="meet-host-form">
        <div className="meets-panel-title">
          <span>Event Setup</span>
          <strong>Meet Details</strong>
        </div>

        <div className="meet-host-grid">
          <label>
            <span>Event Name</span>
            <input name="title" placeholder="Charlotte Supercar Breakfast" required />
          </label>
          <label>
            <span>Format</span>
            <select name="type" defaultValue="Cars & Coffee">
              {MEET_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Date & Time</span>
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            <span>Capacity</span>
            <input name="capacity" type="number" min="1" placeholder="24" />
          </label>
          <label>
            <span>City</span>
            <input name="city" placeholder="Charlotte" required />
          </label>
          <label>
            <span>State</span>
            <input name="state" placeholder="NC" maxLength={2} required />
          </label>
          <label>
            <span>Location Name</span>
            <input name="locationName" placeholder="South End Garage Row" required />
          </label>
          <label>
            <span>Location Privacy</span>
            <select name="visibility" defaultValue="PUBLIC">
              <option value="PUBLIC">Public</option>
              <option value="INVITE_ONLY">Invite Only</option>
            </select>
          </label>
          <label>
            <span>Club</span>
            <select name="clubId" defaultValue={selectedClubId}>
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
          <input name="locationDetail" placeholder="Exact address shared after RSVP" />
        </label>

        <label>
          <span>Exact Address</span>
          <input name="exactAddress" placeholder="Shared only with host and RSVP'd attendees" />
        </label>

        <label>
          <span>Description</span>
          <textarea name="description" rows={4} placeholder="Describe the drive, staging rules, and owner expectations." />
        </label>

        <AllowedMakesDropdown makes={makes} />

        <div className="meet-host-actions">
          <Link href="/meets">Cancel</Link>
          <button type="submit">Publish Meet</button>
        </div>
      </form>
    </main>
  );
}
