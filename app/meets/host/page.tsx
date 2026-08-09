import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createMeetAction } from "@/app/actions/meets";

export const dynamic = "force-dynamic";

export default async function HostMeetPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

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
              <option>Cars & Coffee</option>
              <option>Private Drive</option>
              <option>Garage Night</option>
              <option>Concours</option>
              <option>Track</option>
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

        <fieldset className="meet-make-fieldset">
          <legend>Allowed Makes</legend>
          {["Ferrari", "Lamborghini", "McLaren"].map((make) => (
            <label key={make}>
              <input name="allowedMakes" type="checkbox" value={make} defaultChecked />
              <span>{make}</span>
            </label>
          ))}
        </fieldset>

        <div className="meet-host-actions">
          <Link href="/meets">Cancel</Link>
          <button type="submit">Publish Meet</button>
        </div>
      </form>
    </main>
  );
}
