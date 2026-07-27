import { auth, signIn } from "@/auth";
import Link from "next/link";

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
          <form action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/garage" });
          }}>
            <button type="submit" style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}>
              Continue with Google
            </button>
          </form>
          <form action={async (formData) => {
            "use server";
            await signIn("admin-test", {
              email: String(formData.get("email") || ""),
              password: String(formData.get("password") || ""),
              redirectTo: "/admin/fulfillment",
            });
          }} style={{ display: "grid", gap: 8, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <strong>Admin test login</strong>
            <input name="email" type="email" defaultValue="admin@supercars.test" style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }} />
            <input name="password" type="password" defaultValue="supercars-admin" style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }} />
            <button type="submit" style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: "pointer" }}>
              Continue as Admin
            </button>
          </form>
          <form action={async (formData) => {
            "use server";
            await signIn("user-test", {
              email: String(formData.get("email") || ""),
              password: String(formData.get("password") || ""),
              redirectTo: "/transactions",
            });
          }} style={{ display: "grid", gap: 8, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <strong>Regular user test login</strong>
            <input name="email" type="email" defaultValue="user@supercars.test" style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }} />
            <input name="password" type="password" defaultValue="supercars-user" style={{ padding: 10, border: "1px solid #ddd", borderRadius: 6 }} />
            <button type="submit" style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #111827", background: "#fff", color: "#111827", cursor: "pointer", fontWeight: 700 }}>
              Continue as User
            </button>
          </form>
          <Link href="/" style={{ color: "#2563eb", marginTop: 8 }}>Back to home</Link>
        </div>
      </section>
    </main>
  );
}
