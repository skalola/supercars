"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const DEFAULT_CLUB_LOGO = "/images/supercar-dash-wordmark.svg";

type ClubSortKey = "created" | "members" | "meets";
type SortDirection = "asc" | "desc";

export type PublicClubListItem = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  city: string;
  state: string;
  createdAt: string;
  makeLabel: string;
  modelLabel: string;
  memberCount: number;
  meetCount: number;
};

export default function ClubDirectoryList({ clubs }: { clubs: PublicClubListItem[] }) {
  const [sortKey, setSortKey] = useState<ClubSortKey>("created");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const sortedClubs = useMemo(
    () => [...clubs].sort((left, right) => compareClubs(left, right, sortKey, direction)),
    [clubs, direction, sortKey],
  );

  function toggleSort(nextKey: ClubSortKey) {
    if (nextKey === sortKey) {
      setDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setDirection(nextKey === "created" ? "asc" : "desc");
  }

  return (
    <div id="club-grid" className="club-list" role="table">
      <div className="club-list-header" role="row">
        <span>Name</span>
        <span>Location</span>
        <span>Make</span>
        <span>Model</span>
        <button type="button" onClick={() => toggleSort("members")} className={sortKey === "members" ? "is-active" : ""}>
          Members
        </button>
        <button type="button" onClick={() => toggleSort("meets")} className={sortKey === "meets" ? "is-active" : ""}>
          Meets
        </button>
      </div>
      {sortedClubs.length > 0 ? (
        sortedClubs.map((club) => {
          const location = [club.city, club.state].filter(Boolean).join(", ") || "Nationwide";
          return (
          <Link key={club.id} href={`/clubs/${club.slug}`} className="club-list-row" role="row">
            <div className="club-list-name-cell" data-label="Name">
              <img src={club.logoUrl || DEFAULT_CLUB_LOGO} alt="" />
              <div>
                <strong>{club.name}</strong>
                <small className="club-list-mobile-location">{location}</small>
              </div>
            </div>
            <span data-label="Location">{location}</span>
            <span data-label="Make">{club.makeLabel}</span>
            <span data-label="Model">{club.modelLabel}</span>
            <strong data-label="Members">{club.memberCount}</strong>
            <strong data-label="Meets">{club.meetCount}</strong>
          </Link>
          );
        })
      ) : (
        <div className="club-empty-state">
          <span>Club Grid</span>
          <strong>No clubs yet.</strong>
          <p>Create the first model-led driver club and attach future meets to it.</p>
        </div>
      )}
    </div>
  );
}

function compareClubs(left: PublicClubListItem, right: PublicClubListItem, sortKey: ClubSortKey, direction: SortDirection) {
  let result = 0;
  if (sortKey === "members") result = left.memberCount - right.memberCount;
  if (sortKey === "meets") result = left.meetCount - right.meetCount;
  if (sortKey === "created" || result === 0) {
    result = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  }
  if (result === 0) result = left.name.localeCompare(right.name);
  return direction === "asc" ? result : -result;
}
