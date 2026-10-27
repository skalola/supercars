import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { createCarClubAction } from "@/app/actions/clubs";
import { getMakerSiteCatalog } from "@/lib/maker-sites/catalog";
import { getMakerSiteConfig, getMakerSlugFromHostname } from "@/lib/maker-sites/config";
import { getCatalogMakeOptions } from "@/lib/makes/catalog";
import { prisma } from "@/lib/prisma";
import ClubLocationFields from "./ClubLocationFields";
import ClubLogoCropField from "./ClubLogoCropField";
import ClubModelSelector from "./ClubModelSelector";
import ClubDirectoryList, { type PublicClubListItem } from "./ClubDirectoryList";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const makerHeroPromise = getMakerClubsHero();
  const clubsPromise = getPublicClubs();
  const makeOptionsPromise = getCatalogMakeOptions();
  const [clubs, makeOptions, makerHero] = await Promise.all([
    clubsPromise,
    makeOptionsPromise,
    makerHeroPromise,
  ]);

  const publicClubs: PublicClubListItem[] = clubs.map((club) => {
      const makeNames = Array.from(new Set(club.models.map(({ model }) => model.make.name))).slice(0, 3);
      const modelNames = club.models.map(({ model }) => model.name).slice(0, 4);
      return {
        id: club.id,
        slug: club.slug,
        name: club.name,
        logoUrl: club.logoUrl,
        city: club.city || "",
        state: club.state || "",
        createdAt: serializeDate(club.createdAt),
        makeLabel: makeNames.length > 0 ? makeNames.join(", ") : "All makes",
        modelLabel: modelNames.length > 0 ? modelNames.join(", ") : "All models",
        memberCount: club._count.members,
        meetCount: club._count.meets,
      };
    });

  return (
    <main className="clubs-shell">
      <section
        className="clubs-hero"
        style={makerHero?.imageUrl ? {
          backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.3)), url("${makerHero.imageUrl}")`,
        } : undefined}
      >
        <div>
          <span>{makerHero ? `${makerHero.makeName} Owner Clubs` : "Owner Clubs"}</span>
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
            <strong>{publicClubs.length} active</strong>
          </div>
          <ClubDirectoryList clubs={publicClubs} />
        </section>

        <aside id="create-club" className="club-create-panel">
          <div className="meets-panel-title">
            <span>Creator Tools</span>
            <strong>Start a Club</strong>
          </div>
          <form action={createCarClubAction} className="club-form">
              <label>
                <span>Club Name</span>
                <input name="name" placeholder="Charlotte V10 Owners" required />
              </label>
              <ClubLocationFields />
              <input type="hidden" name="country" value="US" />
              <label>
                <span>Visibility</span>
                <select name="visibility" defaultValue="PUBLIC">
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Private Approval</option>
                </select>
              </label>
              <ClubLogoCropField />
              <label>
                <span>Description</span>
                <textarea name="description" rows={4} placeholder="Model focus, meet style, and membership expectations." />
              </label>
              <ClubModelSelector makes={makeOptions} />
              <button type="submit">Create Club</button>
          </form>
        </aside>
      </section>
    </main>
  );
}

async function getMakerClubsHero() {
  const requestHeaders = await headers();
  const makeSlug = getMakerSlugFromHostname(
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "",
  );
  if (!makeSlug) return null;

  const config = getMakerSiteConfig(makeSlug);
  if (!config?.enabled) return null;

  const make = await getMakerSiteCatalog(makeSlug);
  if (!make) return null;

  const flagship = make.models.find((model) => model.slug === config.flagshipModelSlug) ?? make.models[0];
  return {
    makeName: make.name,
    imageUrl: flagship?.images[0]?.url ?? null,
  };
}

const getPublicClubs = unstable_cache(
  async () => prisma.carClub.findMany({
    where: {
      status: "ACTIVE",
      visibility: "PUBLIC",
    },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      city: true,
      state: true,
      createdAt: true,
      models: {
        select: {
          model: {
            select: {
              name: true,
              make: { select: { name: true } },
            },
          },
        },
        take: 6,
      },
      _count: {
        select: {
          members: { where: { status: "ACTIVE" } },
          meets: { where: { status: { in: ["PUBLISHED", "FULL"] } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 80,
  }).catch(() => []),
  ["public-club-directory-v1"],
  { revalidate: 300, tags: ["public-clubs"] },
);

function serializeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
