import Link from "next/link";
import { auth } from "@/auth";
import { createCarClubAction } from "@/app/actions/clubs";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";
import { prisma } from "@/lib/prisma";
import ClubModelSelector from "./ClubModelSelector";

export const dynamic = "force-dynamic";
const DEFAULT_CLUB_LOGO = "/images/supercar-dash-wordmark.svg";
type ClubSortKey = "created" | "members" | "meets";
type SortDirection = "asc" | "desc";
type SortableClub = {
  name: string;
  createdAt: Date;
  _count: {
    members: number;
    meets: number;
  };
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams?: Promise<{ sort?: string; dir?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const activeSort = resolveSortKey(resolvedSearchParams?.sort);
  const activeDirection = resolveSortDirection(resolvedSearchParams?.dir);
  const [session, catalog] = await Promise.all([
    auth(),
    getMakeModelCatalogOptions(),
  ]);
  const clubs = await prisma.carClub.findMany({
    where: {
      status: "ACTIVE",
      visibility: "PUBLIC",
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
      orderBy: { createdAt: "asc" },
      take: 80,
    }).catch(() => []);

  const sortedClubs = [...clubs]
    .sort((a, b) => compareClubs(a, b, activeSort, activeDirection))
    .map((club) => {
      const makeNames = Array.from(new Set(club.models.map(({ model }) => model.make.name))).slice(0, 3);
      const modelNames = club.models.map(({ model }) => model.name).slice(0, 4);
      return {
        ...club,
        makeLabel: makeNames.length > 0 ? makeNames.join(", ") : "All makes",
        modelLabel: modelNames.length > 0 ? modelNames.join(", ") : "All models",
      };
    });

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
        <section className="club-list-section" aria-label="Existing clubs">
          <div className="club-list-title">
            <span>Existing Clubs</span>
            <strong>{sortedClubs.length} active</strong>
          </div>
          <div id="club-grid" className="club-list" role="table">
            <div className="club-list-header" role="row">
              <span>Name</span>
              <span>Location</span>
              <span>Make</span>
              <span>Model</span>
              <Link href={getSortHref("members", activeSort, activeDirection)} className={activeSort === "members" ? "is-active" : ""}>
                Members
              </Link>
              <Link href={getSortHref("meets", activeSort, activeDirection)} className={activeSort === "meets" ? "is-active" : ""}>
                Meets
              </Link>
            </div>
            {clubs.length > 0 ? (
              sortedClubs.map((club) => (
                <Link key={club.id} href={`/clubs/${club.slug}`} className="club-list-row" role="row">
                  <div className="club-list-name-cell" data-label="Name">
                    <img src={club.logoUrl || DEFAULT_CLUB_LOGO} alt="" />
                    <strong>{club.name}</strong>
                  </div>
                  <span data-label="Location">{club.city}, {club.state}</span>
                  <span data-label="Make">{club.makeLabel}</span>
                  <span data-label="Model">{club.modelLabel}</span>
                  <strong data-label="Members">{club._count.members}</strong>
                  <strong data-label="Meets">{club._count.meets}</strong>
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
        </section>

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
                <span>Club Logo</span>
                <input name="logoFile" type="file" accept="image/jpeg,image/png,image/webp" />
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

function resolveSortKey(value: string | undefined): ClubSortKey {
  return value === "members" || value === "meets" ? value : "created";
}

function resolveSortDirection(value: string | undefined): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function getSortHref(sortKey: ClubSortKey, activeSort: ClubSortKey, activeDirection: SortDirection) {
  const nextDirection = activeSort === sortKey && activeDirection === "desc" ? "asc" : "desc";
  return `/clubs?sort=${sortKey}&dir=${nextDirection}#club-grid`;
}

function compareClubs(
  a: SortableClub,
  b: SortableClub,
  sortKey: ClubSortKey,
  direction: SortDirection,
) {
  if (sortKey === "members" || sortKey === "meets") {
    const left = sortKey === "members" ? a._count.members : a._count.meets;
    const right = sortKey === "members" ? b._count.members : b._count.meets;
    const numeric = direction === "asc" ? left - right : right - left;
    return numeric || a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name);
  }

  return a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name);
}
