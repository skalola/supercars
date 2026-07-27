import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function getAdminSession() {
  const session = await auth();
  return session?.user?.role === "ADMIN" ? session : null;
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function assertAdmin() {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("Admin access required.");
  }
  return session;
}
