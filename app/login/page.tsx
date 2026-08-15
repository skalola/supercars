import Link from "next/link";
import type { Metadata } from "next";
import { auth, signIn } from "@/auth";
import { accountRegistrationAction, accountSignInAction } from "@/app/actions/auth-account";
import LoginAccessPanel from "./LoginAccessPanel";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Sign In" };

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string }> }) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params?.returnTo || "");
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <main className="garage-page-shell auth-page-shell">
      <section className="auth-panel">
        <div className="garage-page-eyebrow">Account access</div>
        {session?.user && (
          <div className="auth-session-card">
            <strong>Signed in as {session.user.email || session.user.name}</strong>
            <div>
              <Link href="/transactions">View transactions</Link>
              {isAdmin && <Link href="/admin/fulfillment">Open admin console</Link>}
            </div>
          </div>
        )}
        <LoginAccessPanel
          returnTo={returnTo}
          signInAction={accountSignInAction}
          registrationAction={accountRegistrationAction}
          googleAction={async () => {
            "use server";
            await signIn("google", { redirectTo: returnTo || "/garage" });
          }}
        />
        <div className="auth-form-stack">
          <Link href="/" className="auth-back-link">Back to home</Link>
        </div>
      </section>
    </main>
  );
}

function sanitizeReturnTo(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
  return trimmed;
}
