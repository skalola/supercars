import Link from "next/link";
import { auth } from "@/auth";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#fff" }}>
        <header
          style={{
            borderBottom: "1px solid #e5e7eb",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            background: "#fff",
          }}
        >
          <Link href="/" style={{ textDecoration: "none", color: "#111827", fontWeight: 800, fontSize: 20 }}>
            SUPERCARS
          </Link>

          <nav style={{ display: "flex", gap: 12, flex: 1, justifyContent: "center" }}>
            <Link href="/make/ferrari" style={{ textDecoration: "none", color: "#111827", padding: "8px 12px", borderRadius: 999, border: "1px solid #e5e7eb", fontWeight: 600 }}>
              Ferrari
            </Link>
            <Link href="/make/lamborghini" style={{ textDecoration: "none", color: "#111827", padding: "8px 12px", borderRadius: 999, border: "1px solid #e5e7eb", fontWeight: 600 }}>
              Lamborghini
            </Link>
          </nav>

          <Link href="/garage" style={{ textDecoration: "none", color: "#111827", fontWeight: 700 }}>
            {session?.user ? "My Garage" : "My Garage"}
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}