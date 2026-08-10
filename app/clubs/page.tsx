import Link from "next/link";
import { auth } from "@/auth";
import { createCarClubAction } from "@/app/actions/clubs";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const [session, catalog, clubs] = await Promise.all([
    auth(),
    getMakeModelCatalogOptions(),
    prisma.carClub.findMany({
      where: { status: "ACTIVE", visibility: "PUBLIC" },
      include: {
        creator: { select: { name: true, username: true } },
        members: { where: { status: "ACTIVE" }, select: { id: true } },
        models: {
          include: { model: { include: { make: true, images: { take: 1 } } } },
          take: 6,
        },
        _count: {
          select: {
            members: { where: { status: "ACTIVE" } },
            models: true,
            meets: { where: { status: { in: ["PUBLISHED", "FULL"] } } },
          },
        },
        meets: {
          where: { status: { in: ["PUBLISHED", "FULL"] } },
          orderBy: { startsAt: "asc" },
          take: 2,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 36,
    }).catch(() => []),
  ]);

  const modelOptions = catalog.models.slice(0, 180);

  return (
    <main className="clubs-shell">
      <section className="clubs-hero">
        <div>
          <span>Owner Clubs</span>
          <h1>Find your driver circle.</h1>
          <p>Build model-led car clubs, connect them to meets, and let verified garages become the social layer of SUPERCAR DASH.</p>
          <div className="clubs-hero-actions">
            <a href="#create-club" className="meets-primary-button">Start a Club</a>
            <a href="#club-grid" className="meets-secondary-button">Browse Clubs</a>
          </div>
        </div>
      </section>

      <section className="clubs-layout">
        <div id="club-grid" className="clubs-grid">
          {clubs.length > 0 ? (
            clubs.map((club) => (
              <Link key={club.id} href={`/clubs/${club.slug}`} className="club-card">
                <div className="club-card-image-grid">
                  {club.models.slice(0, 3).map(({ model }) => (
                    <div
                      key={model.id}
                      className="club-card-image"
                      style={{ backgroundImage: `url("${model.images[0]?.url || model.make.logoUrl || "/images/garage-home-hero.png?v=garage-2"}")` }}
                    />
                  ))}
                </div>
                <div className="club-card-copy">
                  <span>{club.city}, {club.state}</span>
                  <h2>{club.name}</h2>
                  <p>{club.description || "A SUPERCAR DASH owner club for model-specific meets, members, and garage activity."}</p>
                </div>
                <div className="club-card-stats">
                  <span>{club._count.members} members</span>
                  <span>{club._count.models} models</span>
                  <span>{club._count.meets} meets</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="club-empty-state">
              <span>Club Grid</span>
              <strong>No clubs yet.</strong>
              <p>Create the first model-led driver club and attach future meets to it.</p>
            </div>
          )}
        </div>

        <aside id="create-club" className="club-create-panel">
          <div className="meets-panel-title">
            <span>Creator Tools</span>
            <strong>Start a Club</strong>
          </div>
          {session?.user?.id ? (
            <form action={createCarClubAction} className="club-form">
              <label>
                <span>Club Name</span>
                <input name="name" placeholder="Charlotte V10 Owners" required />
              </label>
              <div className="club-form-grid">
                <label>
                  <span>City</span>
                  <input name="city" placeholder="Charlotte" required />
                </label>
                <label>
                  <span>State</span>
                  <input name="state" placeholder="NC" maxLength={2} required />
                </label>
              </div>
              <input type="hidden" name="country" value="US" />
              <label>
                <span>Visibility</span>
                <select name="visibility" defaultValue="PUBLIC">
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Private Approval</option>
                </select>
              </label>
              <label>
                <span>Description</span>
                <textarea name="description" rows={4} placeholder="Model focus, meet style, and membership expectations." />
              </label>
              <fieldset className="club-model-picker">
                <legend>Linked Models</legend>
                {modelOptions.map((model) => (
                  <label key={model.id}>
                    <input name="modelIds" type="checkbox" value={model.id} />
                    <span>{model.make.name} {model.name}</span>
                  </label>
                ))}
              </fieldset>
              <button type="submit">Create Club</button>
            </form>
          ) : (
            <div className="club-empty-state is-compact">
              <strong>Sign in to create a club.</strong>
              <p>Club creators become the first moderator automatically.</p>
              <Link href="/login" className="meets-primary-button">Sign In</Link>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
