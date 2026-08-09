import { MeetsMapExperience } from "./MeetsMapExperience";
import { getUpcomingMeetEvents } from "./meet-data";

export const dynamic = "force-dynamic";

export default async function MeetsPage() {
  const meetEvents = await getUpcomingMeetEvents();

  return (
    <main className="meets-page-shell">
      <section className="meets-map-stage" aria-label="Upcoming SUPERCAR DASH meets">
        <div className="meets-map-copy">
          <span>SUPERCAR DASH MEETS</span>
          <h1>Find the next drive.</h1>
          <p>Upcoming owner gatherings, private routes, and garage nights mapped around verified cars.</p>
        </div>

        <MeetsMapExperience meetEvents={meetEvents} />
      </section>
    </main>
  );
}
