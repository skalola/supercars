import Link from "next/link";
import { auth } from "@/auth";
import { createCarClubAction } from "@/app/actions/clubs";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";
import { prisma } from "@/lib/prisma";
import ClubModelSelector from "./ClubModelSelector";

export const dynamic = "force-dynamic";

export default async function ClubsPage({ searchParams }: { searchParams?: Promise<{ make?: string; model?: string; location?: string; sort?: string }> }) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMakeId = resolvedSearchParams.make || "";
  const selectedModelId = resolvedSearchParams.model || "";
  const locationQuery = (resolvedSearchParams.location || "").trim();
  const sort = resolvedSearchParams.sort || "members";

  const [session, catalog] = await Promise.all([
    auth(),
    getMakeModelCatalogOptions(),
  ]);
  const clubs = await prisma.carClub.findMany({
    where: {
      status: "ACTIVE",
      visibility: "PUBLIC",
      ...(selectedModelId || selectedMakeId
        ? {
            models: {
              some: {
                model: {
                  ...(selectedModelId ? { id: selectedModelId } : {}),
                  ...(selectedMakeId ? { makeId: selectedMakeId } : {}),
                },
              },
            },
          }
        : {}),
      ...(locationQuery
        ? {
            OR: [
              { city: { contains: locationQuery, mode: "insensitive" } },
              { state: { contains: locationQuery, mode: "insensitive" } },
              { name: { contains: locationQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
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
      take: 80,
    }).catch(() => []);

  const sortedClubs = [...clubs].sort((a, b) => {
    if (sort === "meets") return b._count.meets - a._count.meets || b._count.members - a._count.members || a.name.localeCompare(b.name);
    if (sort === "newest") return b.updatedAt.getTime() - a.updatedAt.getTime();
    return b._count.members - a._count.members || b._count.meets - a._count.meets || a.name.localeCompare(b.name);
  });
  const clubsByMembers = [...clubs]
    .sort((a, b) => b._count.members - a._count.members || b._count.meets - a._count.meets || a.name.localeCompare(b.name))
    .slice(0, 10);
  const clubsByMeets = [...clubs]
    .sort((a, b) => b._count.meets - a._count.meets || b._count.members - a._count.members || a.name.localeCompare(b.name))
    .slice(0, 10);

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
        <div id="club-grid" className="club-browser-panel">
          <div className="meets-panel-title">
            <span>Existing Clubs</span>
            <strong>Browse the Grid</strong>
          </div>

          <div className="club-leaderboard" aria-label="Club leaderboards">
            <article>
              <div className="meets-panel-title">
                <span>Most Members</span>
                <strong>Largest Clubs</strong>
              </div>
              <div className="club-rank-list">
                {clubsByMembers.length > 0 ? (
                  clubsByMembers.map((club, index) => (
                    <Link key={club.id} href={`/clubs/${club.slug}`} className="club-rank-row">
                      <em>{String(index + 1).padStart(2, "0")}</em>
                      <div>
                        <strong>{club.name}</strong>
                        <span>{club.city}, {club.state}</span>
                      </div>
                      <p>{club._count.members} members</p>
                    </Link>
                  ))
                ) : (
                  <p className="meet-empty-note">No member activity yet.</p>
                )}
              </div>
            </article>

            <article>
              <div className="meets-panel-title">
                <span>Most Meets</span>
                <strong>Most Active Clubs</strong>
              </div>
              <div className="club-rank-list">
                {clubsByMeets.length > 0 ? (
                  clubsByMeets.map((club, index) => (
                    <Link key={club.id} href={`/clubs/${club.slug}`} className="club-rank-row">
                      <em>{String(index + 1).padStart(2, "0")}</em>
                      <div>
                        <strong>{club.name}</strong>
                        <span>{club.city}, {club.state}</span>
                      </div>
                      <p>{club._count.meets} meets</p>
                    </Link>
                  ))
                ) : (
                  <p className="meet-empty-note">No club-hosted meets yet.</p>
                )}
              </div>
            </article>
          </div>

          <div className="clubs-grid">
            {clubs.length > 0 ? (
              sortedClubs.map((club) => (
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
        </div>

        <aside id="create-club" className="club-create-panel">
          <form action="/clubs" className="club-filter-panel">
            <div className="meets-panel-title">
              <span>Discovery</span>
              <strong>Filter Clubs</strong>
            </div>
            <label>
              <span>Make</span>
              <select name="make" defaultValue={selectedMakeId}>
                <option value="">All makes</option>
                {catalog.makes.map((make) => (
                  <option key={make.id} value={make.id}>{make.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Model</span>
              <select name="model" defaultValue={selectedModelId}>
                <option value="">All models</option>
                {catalog.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.make.name} {model.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Location</span>
              <input name="location" defaultValue={locationQuery} placeholder="City or state" />
            </label>
            <label>
              <span>Sort</span>
              <select name="sort" defaultValue={sort}>
                <option value="members">Most members</option>
                <option value="meets">Most meets</option>
                <option value="newest">Newest</option>
              </select>
            </label>
            <div className="club-filter-actions">
              <button type="submit">Apply</button>
              <Link href="/clubs">Reset</Link>
            </div>
          </form>

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
              <ClubModelSelector makes={catalog.makes} models={catalog.models} />
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
