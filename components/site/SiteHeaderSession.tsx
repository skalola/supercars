"use client";

import { useEffect, useState } from "react";
import { SiteHeader, type SiteHeaderProps } from "@/components/site/SiteHeader";
import { NAV_SESSION_KEY } from "@/components/site/navigation-session-cache";

const NAV_SESSION_TTL_MS = 5 * 60 * 1000;

type CachedNavigation = {
  cachedAt: number;
  state: SiteHeaderProps;
};

const signedOutNavigation: SiteHeaderProps = {
  isSignedIn: false,
  isAdmin: false,
  userLabel: "Profile",
  profileHref: "/login",
  garageHref: "/garage",
  trackersHref: null,
  profileImageUrl: null,
};

export function SiteHeaderSession() {
  const [navigation, setNavigation] = useState<SiteHeaderProps>(signedOutNavigation);

  useEffect(() => {
    const controller = new AbortController();
    const cached = readCachedNavigation();

    if (cached) {
      queueMicrotask(() => setNavigation(cached));
      return () => controller.abort();
    }

    fetch("/api/account/navigation", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Navigation session request failed (${response.status}).`);
        return response.json() as Promise<Partial<SiteHeaderProps>>;
      })
      .then((result) => {
        const nextState: SiteHeaderProps = result.isSignedIn
          ? {
              isSignedIn: true,
              isAdmin: Boolean(result.isAdmin),
              userLabel: result.userLabel || "Profile",
              profileHref: result.profileHref || "/garage",
              garageHref: result.garageHref || "/garage",
              trackersHref: result.trackersHref || null,
              profileImageUrl: result.profileImageUrl || null,
            }
          : signedOutNavigation;

        setNavigation(nextState);
        writeCachedNavigation(nextState);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNavigation(signedOutNavigation);
      });

    return () => controller.abort();
  }, []);

  return <SiteHeader {...navigation} />;
}

function readCachedNavigation() {
  try {
    const value = window.sessionStorage.getItem(NAV_SESSION_KEY);
    if (!value) return null;
    const cached = JSON.parse(value) as CachedNavigation;
    if (!cached.cachedAt || Date.now() - cached.cachedAt > NAV_SESSION_TTL_MS) {
      window.sessionStorage.removeItem(NAV_SESSION_KEY);
      return null;
    }
    return cached.state;
  } catch {
    return null;
  }
}

function writeCachedNavigation(state: SiteHeaderProps) {
  try {
    window.sessionStorage.setItem(
      NAV_SESSION_KEY,
      JSON.stringify({ cachedAt: Date.now(), state } satisfies CachedNavigation),
    );
  } catch {
    // Navigation still works when storage is unavailable.
  }
}
