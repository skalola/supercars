import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const userLabel = session?.user?.email || session?.user?.name || "Signed in";

  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link href="/" className="site-brand">
              SUPERCAR DASH
            </Link>

            <details className="site-mobile-menu">
              <summary className="site-menu-button" aria-label="Open navigation">
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </summary>
              <nav className="site-mobile-nav" aria-label="Mobile navigation">
                <Link href="/make/ferrari" className="site-nav-link">
                  Ferrari
                </Link>
                <Link href="/make/lamborghini" className="site-nav-link">
                  Lamborghini
                </Link>
                <Link href="/inventory" className="site-nav-link">
                  Inventory
                </Link>
                {session?.user && (
                  <Link href="/transactions" className="site-nav-link">
                    Transactions
                  </Link>
                )}
                {isAdmin && (
                  <Link href="/admin/fulfillment" className="site-nav-link is-admin">
                    Admin
                  </Link>
                )}
                {session?.user ? (
                  <>
                    <Link href="/garage" className="site-nav-link">
                      My Garage
                    </Link>
                    <form action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}>
                      <button type="submit" className="site-mobile-nav-button">
                        Log out
                      </button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="site-nav-link">
                    Sign in
                  </Link>
                )}
              </nav>
            </details>

            <nav className="site-nav" aria-label="Primary navigation">
              <Link href="/make/ferrari" className="site-nav-link">
                Ferrari
              </Link>
              <Link href="/make/lamborghini" className="site-nav-link">
                Lamborghini
              </Link>
              <Link href="/inventory" className="site-nav-link">
                Inventory
              </Link>
              {session?.user && (
                <Link href="/transactions" className="site-nav-link">
                  Transactions
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin/fulfillment" className="site-nav-link is-admin">
                  Admin
                </Link>
              )}
            </nav>

            <div className="site-actions">
              {session?.user ? (
                <>
                  <div className="site-user">
                    <span className="site-user-kicker">Signed in</span>
                    <span className="site-user-name">
                      {userLabel}
                    </span>
                  </div>
                  <Link href="/garage" className="site-link-button">
                    My Garage
                  </Link>
                  <form action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}>
                    <button type="submit" className="site-button">
                      Log out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="site-button">
                  Sign in
                </Link>
              )}
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
