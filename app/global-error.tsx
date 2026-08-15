"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#050505", color: "#fff", fontFamily: "Arial, sans-serif" }}>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
          <p style={{ color: "#ef233c", textTransform: "uppercase" }}>SUPERCAR DASH</p>
          <h1>We hit an unexpected error.</h1>
          <p>Please try again. If the issue continues, contact support.</p>
          <button type="button" onClick={reset} style={{ padding: "12px 20px", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
