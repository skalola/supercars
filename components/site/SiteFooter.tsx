import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer w-full mt-12 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-sm text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} SUPERCAR DASH. All rights reserved.
        </div>
        <div className="flex gap-6 text-sm text-[var(--text-muted)]">
          <Link href="/legal/terms" className="hover:text-[var(--text-primary)] transition-colors">
            Terms of Use
          </Link>
          <Link href="/legal/privacy" className="hover:text-[var(--text-primary)] transition-colors">
            Privacy Policy
          </Link>
          <Link href="/legal/financial-privacy" className="hover:text-[var(--text-primary)] transition-colors">
            Financial Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
