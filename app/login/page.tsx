import Link from "next/link";
import { auth, signIn } from "@/auth";

async function credentialSignIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") || ""));
  const adminEmail = (process.env.ADMIN_TEST_EMAIL || "admin@supercars.test").toLowerCase();
  const provider = email.toLowerCase() === adminEmail ? "admin-test" : "user-test";

  await signIn(provider, {
    email,
    password,
    redirectTo: returnTo || (provider === "admin-test" ? "/admin/fulfillment" : "/transactions"),
  });
}

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string }> }) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params?.returnTo || "");
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <main className="garage-page-shell auth-page-shell">
      <section className="auth-panel">
        <div className="garage-page-eyebrow">Account access</div>
        <h1>Sign in</h1>
        <p>Use your SUPERCAR DASH account to manage garage, transaction, and admin workflows.</p>
        {session?.user && (
          <div className="auth-session-card">
            <strong>Signed in as {session.user.email || session.user.name}</strong>
            <div>
              <Link href="/transactions">View transactions</Link>
              {isAdmin && <Link href="/admin/fulfillment">Open admin console</Link>}
            </div>
          </div>
        )}
        <div className="auth-form-stack">
          <form action={credentialSignIn} className="auth-form">
            <strong>Account login</strong>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="off"
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              required
            />
            <button type="submit" className="garage-primary-button">
              Sign in
            </button>
          </form>
          <div className="auth-divider">
            <span />
            <span>or</span>
            <span />
          </div>
          <form action={async () => {
            "use server";
            await signIn("google", { redirectTo: returnTo || "/garage" });
          }}>
            <button type="submit" className="auth-google-button">
              Continue with Google
            </button>
          </form>
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
