import { redirect } from "next/navigation";

export default function FerrariPartsPage() {
  redirect("/parts?make=ferrari");
}
