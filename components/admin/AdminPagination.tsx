import Link from "next/link";

type AdminPaginationProps = {
  pathname: string;
  page: number;
  totalPages: number;
  pageParam?: string;
  preserveParams?: Record<string, string | undefined>;
  ariaLabel?: string;
};

export function AdminPagination({
  pathname,
  page,
  totalPages,
  pageParam = "page",
  preserveParams = {},
  ariaLabel = "Admin results pages",
}: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(preserveParams)) {
      if (value) params.set(key, value);
    }
    params.set(pageParam, String(targetPage));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <nav className="market-pagination" aria-label={ariaLabel}>
      {page > 1 ? (
        <Link className="market-pagination-link" href={pageHref(page - 1)}>
          Previous
        </Link>
      ) : (
        <span className="market-pagination-link is-disabled">Previous</span>
      )}
      <span>
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </span>
      {page < totalPages ? (
        <Link className="market-pagination-link" href={pageHref(page + 1)}>
          Next
        </Link>
      ) : (
        <span className="market-pagination-link is-disabled">Next</span>
      )}
    </nav>
  );
}

export function parseAdminPage(value: string | string[] | undefined) {
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
