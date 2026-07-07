import { signIn } from "@/auth";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Sign in</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Use one of the supported providers to continue.</p>
      <div style={{ display: "grid", gap: 12 }}>
        <form action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/garage" });
        }}>
          <button type="submit" style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}>
            Continue with Google
          </button>
        </form>
        <form action={async () => {
          "use server";
          await signIn("apple", { redirectTo: "/garage" });
        }}>
          <button type="submit" style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}>
            Continue with Apple
          </button>
        </form>
        <Link href="/" style={{ color: "#2563eb", marginTop: 8 }}>Back to home</Link>
      </div>
    </main>
  );
}
