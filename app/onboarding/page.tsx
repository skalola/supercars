import { auth } from "@/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updateUsername } from "@/app/actions/onboarding";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...privateMetadata, title: "Create Your Garage" };

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="garage-page-shell auth-page-shell">
      <section className="auth-panel">
        <div className="garage-page-eyebrow">Garage setup</div>
        <h1>Welcome</h1>
        <p>Choose a unique username for your SUPERCAR DASH garage.</p>
        <form action={updateUsername} className="auth-form">
          <strong>Profile handle</strong>
          <input
            name="username"
            placeholder="Choose a username..."
            autoComplete="off"
            required
          />
          <button type="submit" className="garage-primary-button">
            Create Garage
          </button>
        </form>
      </section>
    </main>
  );
}
