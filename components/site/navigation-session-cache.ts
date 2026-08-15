export const NAV_SESSION_KEY = "supercar-dash:nav-session";

export function clearCachedNavigationSession() {
  try {
    window.sessionStorage.removeItem(NAV_SESSION_KEY);
  } catch {
    // Authentication does not depend on browser storage.
  }
}
