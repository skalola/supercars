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
    return <div style={{ padding: 40 }}>Model not found</div>;
  }

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Claim Your {model.make.name} {model.name}</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Enter your vehicle's VIN to begin the ownership verification process.
      </p>
      <ClaimForm 
        modelId={model.id} 
        modelName={model.name} 
        makeName={model.make.name} 
      />
    </main>
  );
}
