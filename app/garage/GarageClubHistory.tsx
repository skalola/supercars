import Link from "next/link";
import type { GarageClubSummaryItem } from "./garage-clubs";

export default function GarageClubHistory({ clubs, isOwner }: { clubs: GarageClubSummaryItem[]; isOwner: boolean }) {
  return (
    <section className="garage-club-history" aria-label="Garage club history">
      <div className="garage-meet-heading">
        <div>
          <span>Clubs</span>
          <strong>Driver Clubs</strong>
        </div>
        <Link href={isOwner ? "/clubs#create-club" : "/clubs"}>{isOwner ? "Start a Club" : "View Clubs"}</Link>
      </div>

      {clubs.length > 0 ? (
        <div className="garage-club-grid">
          {clubs.map((club) => (
            <Link key={club.id} href={club.href} className="garage-club-card">
              <div>
                <span>{club.status === "PENDING" ? "Pending Request" : club.role === "OWNER" ? "Owner" : "Member"}</span>
                <strong>{club.name}</strong>
                <p>{club.location}</p>
              </div>
              <div className="garage-club-card-stats">
                <span>{club.memberCount} members</span>
                <span>{club.modelCount} models</span>
                <span>{club.meetCount} meets</span>
              </div>
              {club.modelLabels.length > 0 ? (
                <div className="garage-club-models">
                  {club.modelLabels.map((label) => (
                    <em key={label}>{label}</em>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="garage-empty-panel garage-club-empty">
          <h2>No clubs yet</h2>
          <p>{isOwner ? "Create a driver club and connect it to meets." : "This garage has not joined any public clubs yet."}</p>
          <Link href={isOwner ? "/clubs#create-club" : "/clubs"}>{isOwner ? "Start a Club" : "Browse Clubs"}</Link>
        </div>
      )}
    </section>
  );
}
