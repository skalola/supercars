import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ClaimForm from "../ClaimForm";

export default async function ClaimPage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const model = await prisma.model.findUnique({
    where: { id: modelId },
    include: { make: true },
  });

  if (!model) {
    return (
      <main className="garage-page-shell auth-page-shell">
        <section className="auth-panel">
          <div className="garage-page-eyebrow">Claim vehicle</div>
          <h1>Model not found</h1>
          <p>This model is not available for ownership verification.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="garage-page-shell claim-page-shell">
      <section className="claim-panel">
        <div>
          <div className="garage-page-eyebrow">Ownership verification</div>
          <h1>
            Claim Your {model.make.name} {model.name}
          </h1>
          <p>Enter your vehicle VIN to create a verified Vehicle Passport in your garage.</p>
        </div>
        <ClaimForm
          modelId={model.id}
          modelName={model.name}
          makeName={model.make.name}
        />
      </section>
    </main>
  );
}
