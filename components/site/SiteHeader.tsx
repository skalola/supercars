"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth-session";
import { ClaimVinButton } from "@/components/garage/ClaimVinButton";

type SiteHeaderProps = {
  isSignedIn: boolean;
  isAdmin: boolean;
  userLabel: string;
  profileHref: string;
  trackersHref?: string | null;
  profileImageUrl?: string | null;
};

const leftNavLinks = [
  { href: "/garage", label: "Garage" },
  { href: "/meets", label: "Meets" },
  { href: "/inventory", label: "Market" },
];

const rightNavLinks: typeof leftNavLinks = [];

export function SiteHeader({ isSignedIn, isAdmin, userLabel, profileHref, trackersHref, profileImageUrl }: SiteHeaderProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setIsAccountOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileOpen(false);
        setIsAccountOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const closeMenus = () => {
    setIsMobileOpen(false);
    setIsAccountOpen(false);
  };

  return (
    <header className="site-header">
      <Link href="/" className="site-brand" aria-label="SUPERCAR DASH home" onClick={closeMenus}>
        <img src="/images/supercar-dash-wordmark.svg" alt="" aria-hidden="true" />
      </Link>

      <div className="site-mobile-menu">
        <button
          type="button"
          className="site-menu-button"
          aria-label={isMobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <nav
          className={`site-mobile-nav${isMobileOpen ? " is-open" : ""}`}
          aria-label="Mobile navigation"
          aria-hidden={!isMobileOpen}
        >
          {[...leftNavLinks, ...rightNavLinks].map((link) => (
            <Link key={`${link.label}:${link.href}`} href={link.href} className="site-nav-link" onClick={closeMenus}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <nav className="site-nav" aria-label="Primary navigation">
        {leftNavLinks.map((link) => (
          <Link key={`${link.label}:${link.href}`} href={link.href} className="site-nav-link">
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="site-actions">
        <nav className="site-nav site-nav-right" aria-label="Secondary navigation">
          {rightNavLinks.map((link) => (
            <Link key={`${link.label}:${link.href}`} href={link.href} className="site-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>
        {isSignedIn ? (
          <div
            ref={accountRef}
            className={`site-account-menu${isAccountOpen ? " is-open" : ""}`}
          >
            <Link href={profileHref} className="site-profile-button" onClick={closeMenus}>
              {profileImageUrl ? (
                <img className="site-profile-avatar" src={profileImageUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="site-profile-icon" aria-hidden="true">
                  <span />
                </span>
              )}
              <span className="site-profile-name">{userLabel}</span>
            </Link>
            <button
              type="button"
              className="site-account-toggle"
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={isAccountOpen}
              onClick={() => setIsAccountOpen((open) => !open)}
            >
              <span aria-hidden="true" />
            </button>

            <div className="site-account-dropdown" role="menu" aria-label="Account menu">
              <Link href={profileHref} className="site-account-link" role="menuitem" onClick={closeMenus}>
                {isAdmin ? "Admin Portal" : "Profile"}
              </Link>
              <Link href="/garage" className="site-account-link" role="menuitem" onClick={closeMenus}>
                My Garage
              </Link>
              <ClaimVinButton label="Claim Car" isSignedIn={isSignedIn} variant="menu" onOpen={closeMenus} />
              {!isAdmin && trackersHref ? (
                <Link href={trackersHref} className="site-account-link" role="menuitem" onClick={closeMenus}>
                  Trackers
                </Link>
              ) : null}
              <Link href="/transactions" className="site-account-link" role="menuitem" onClick={closeMenus}>
                Transactions
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="site-account-button" role="menuitem">
                  Log out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <Link href="/login" className="site-button" onClick={closeMenus}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
