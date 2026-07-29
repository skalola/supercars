import { auth, signIn } from "@/auth";
import Link from "next/link";

async function credentialSignIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const adminEmail = (process.env.ADMIN_TEST_EMAIL || "admin@supercars.test").toLowerCase();
  const provider = email.toLowerCase() === adminEmail ? "admin-test" : "user-test";

  await signIn(provider, {
    email,
    password,
    redirectTo: provider === "admin-test" ? "/admin/fulfillment" : "/transactions",
  });
}

export default async function LoginPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <main className="page-shell" style={{ maxWidth: 620 }}>
      <section className="surface-panel">
        <div className="eyebrow">Account</div>
        <h1 className="page-title compact">Sign in</h1>
        <p className="page-copy" style={{ marginBottom: 24 }}>Use one of the supported providers to continue.</p>
        {session?.user && (
          <div style={{ display: "grid", gap: 10, padding: 12, border: "1px solid #d1fae5", background: "#ecfdf5", borderRadius: 8, marginBottom: 12 }}>
            <strong>Signed in as {session.user.email || session.user.name}</strong>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/transactions" style={{ color: "#047857", fontWeight: 700 }}>View transactions</Link>
              {isAdmin && <Link href="/admin/fulfillment" style={{ color: "#047857", fontWeight: 700 }}>Open admin console</Link>}
            </div>
          </div>
        )}
        <div style={{ display: "grid", gap: 12 }}>
          <form action={credentialSignIn} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <strong>Account login</strong>
            <input
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="off"
              required
              style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              required
              style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}
            />
            <button type="submit" style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
              Sign in
            </button>
          </form>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", color: "#9ca3af", fontSize: 12 }}>
            <span style={{ height: 1, background: "#e5e7eb" }} />
            <span>or</span>
            <span style={{ height: 1, background: "#e5e7eb" }} />
          </div>
          <form action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/garage" });
          }}>
            <button type="submit" style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
              Continue with Google
            </button>
          </form>
          <Link href="/" style={{ color: "#2563eb", marginTop: 8 }}>Back to home</Link>
        </div>
      </section>
    </main>
  );
}
