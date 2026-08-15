import Image from "next/image";
import Link from "next/link";
import type { GarageClubSummaryItem } from "./garage-clubs";

type GarageClubBadgesProps = {
  clubs: GarageClubSummaryItem[];
};

export default function GarageClubBadges({ clubs }: GarageClubBadgesProps) {
  const visibleClubs = clubs.slice(0, 5);

  return (
    <div className="garage-profile-clubs" aria-label="Car club badges">
      <span>Car Clubs</span>
      <div className="garage-profile-club-list">
        {visibleClubs.map((club) => (
          <Link key={club.id} href={club.href} title={club.name} aria-label={club.name}>
            {club.logoUrl ? (
              <Image
                src={club.logoUrl}
                alt=""
                width={150}
                height={150}
                sizes="(max-width: 720px) 22vw, (max-width: 900px) 16vw, 150px"
                unoptimized
              />
            ) : <span>{club.name.slice(0, 2).toUpperCase()}</span>}
          </Link>
        ))}
        {visibleClubs.length === 0 ? <small>No club badges yet</small> : null}
      </div>
    </div>
  );
}
