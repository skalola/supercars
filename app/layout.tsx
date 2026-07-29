import { Analytics } from "@vercel/analytics/next";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/site/SiteHeader";
import { prisma } from "@/lib/prisma";
import "./globals.css";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const navUser = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id as string },
        select: { username: true, name: true, email: true, image: true },
      })
    : null;
  const userLabel = navUser?.username || navUser?.name || navUser?.email || "Profile";
  const profileHref = isAdmin ? "/admin" : navUser?.username ? `/garage/${navUser.username}` : "/garage";
  const trackersHref = !isAdmin && navUser?.username ? `/garage/${navUser.username}/trackers` : null;
  const profileImageUrl = isAdmin ? null : navUser?.image || session?.user?.image || null;

  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <SiteHeader
            isSignedIn={Boolean(session?.user)}
            isAdmin={isAdmin}
            userLabel={userLabel}
            profileHref={profileHref}
            trackersHref={trackersHref}
            profileImageUrl={profileImageUrl}
          />
          {children}
        </div>
        <Analytics />
      </body>
    </html>
  );
}
