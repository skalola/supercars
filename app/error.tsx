"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SUPERCAR DASH route error", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="page-shell">
      <section className="surface-panel" role="alert" style={{ maxWidth: 720, margin: "48px auto" }}>
        <p className="eyebrow">Something went wrong</p>
        <h1>We could not load this page.</h1>
        <p>Please try again. Your transaction was not submitted twice.</p>
        <button type="button" className="primary-button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
