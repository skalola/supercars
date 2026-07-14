import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { updateUsername } from "@/app/actions/onboarding";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Welcome!</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Almost there. Please choose a unique username for your garage.
      </p>
      <form action={updateUsername} style={{ display: "grid", gap: 16 }}>
        <input 
          name="username" 
          placeholder="Choose a username..." 
          style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #ddd", fontSize: 16 }}
          required 
        />
        <button type="submit" style={{ padding: "12px 16px", borderRadius: 8, background: "#000", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
          Create Garage
        </button>
      </form>
    </main>
  );
}
