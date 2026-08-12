import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import { acceptClubInviteAction } from "@/app/actions/clubs";
import { verifyClubInviteToken } from "@/lib/clubs/invite-token";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClubInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = verifyClubInviteToken(token);
  if (!invite) notFound();

  const [session, club, inviter] = await Promise.all([
    auth(),
    prisma.carClub.findFirst({
      where: { id: invite.clubId, status: "ACTIVE" },
      include: {
        creator: { select: { name: true, username: true, image: true } },
        members: { where: { status: "ACTIVE" }, select: { id: true } },
        models: {
          take: 4,
          include: { model: { include: { make: true, images: { take: 1 } } } },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: invite.inviterId },
      select: { name: true, username: true, image: true },
    }),
  ]);

  if (!club) notFound();

  const inviterName = inviter?.name || inviter?.username || club.creator.name || club.creator.username || "A SUPERCAR DASH member";
  const heroImage = club.models[0]?.model.images[0]?.url || club.models[0]?.model.make.logoUrl || "/images/garage-home-hero.png?v=garage-2";
  const modelLabels = club.models.map(({ model }) => `${model.make.name} ${model.name}`);
  const returnTo = `/clubs/invite/${token}`;

  async function googleInviteSignIn() {
    "use server";
    await signIn("google", { redirectTo: returnTo });
  }

  return (
    <main className="club-invite-page">
      <section className="club-invite-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.42)), url("${heroImage}")` }}>
        <div className="club-invite-copy">
          <Link href="/clubs" className="meet-back-link">&lt; Back to Clubs</Link>
          <span className="club-invite-kicker">Club Invitation</span>
          <h1>You have been invited to join {club.name}</h1>
          <p>{inviterName} invited you into a SUPERCAR DASH club built around real garages, meets, and model communities.</p>
          <div className="club-invite-club-card">
            <img src={club.logoUrl || "/images/supercar-dash-wordmark.svg"} alt="" />
            <div>
              <strong>{club.name}</strong>
              <span>{[club.city, club.state].filter(Boolean).join(", ") || "Location pending"}</span>
            </div>
            <em>{club.members.length.toLocaleString()} members</em>
          </div>
          {modelLabels.length ? (
            <div className="club-invite-models">
              {modelLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
          ) : null}
        </div>

        <aside className="club-invite-signup-card">
          <span>Join the Grid</span>
          <h2>{session?.user ? "Accept Invite" : "Create your driver profile"}</h2>
          <p>
            {session?.user
              ? `Signed in as ${session.user.email || session.user.name || "SUPERCAR DASH member"}. Accepting adds this club to your garage profile.`
              : "Sign in or create an account to auto-join this club and add the badge to your garage."}
          </p>
          {session?.user ? (
            <form action={acceptClubInviteAction}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="garage-primary-button">Accept Invite</button>
            </form>
          ) : (
            <>
              <form action={googleInviteSignIn}>
                <button type="submit" className="garage-primary-button">Continue with Google</button>
              </form>
              <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="meets-secondary-button">
                Sign in with email
              </Link>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
