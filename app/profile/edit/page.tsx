import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProfileEditForm } from "./ProfileEditForm";

export default async function EditProfilePage() {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      username: true,
      email: true,
      image: true,
    },
  });

  if (!user) redirect("/login");

  const garageHref = user.username ? `/garage/${user.username}` : "/garage";

  return (
    <main className="page-shell profile-edit-shell">
      <section className="profile-edit-panel">
        <div className="profile-edit-heading">
          <div>
            <div className="eyebrow">Driver Profile</div>
            <h1>Edit Profile</h1>
            <p>Update the identity shown in your garage, clubs, meets, and account menu.</p>
          </div>
          <Link href={garageHref}>View Garage</Link>
        </div>

        <div className="profile-edit-grid">
          <div className="profile-edit-preview">
            {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true" />}
            <strong>{user.username || user.name || "SUPERCAR DASH Driver"}</strong>
            <small>{user.email || "Signed in account"}</small>
          </div>
          <ProfileEditForm user={user} />
        </div>
      </section>
    </main>
  );
}
