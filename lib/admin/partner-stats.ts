import { prisma } from "@/lib/prisma";

type PartnerCoverageRow = {
  type: string;
  eligibleCount: number;
  activeCount: number;
};

export async function getAdminPartnerCoverageStats() {
  const rows = await prisma.$queryRaw<PartnerCoverageRow[]>`
    WITH active_contacts AS (
      SELECT
        contact."type",
        contact."email",
        contact."website",
        regexp_replace(
          split_part(regexp_replace(lower(contact."website"), '^https?://', ''), '/', 1),
          '^www\\.',
          ''
        ) AS website_host,
        split_part(lower(contact."email"), '@', 2) AS email_host
      FROM "PartnerContact" contact
      WHERE contact."active" = TRUE
        AND contact."contactStatus" = 'RESOLVED'
        AND contact."email" IS NOT NULL
        AND BTRIM(contact."email") <> ''
        AND contact."website" IS NOT NULL
        AND BTRIM(contact."website") <> ''
        AND contact."phone" IS NOT NULL
        AND BTRIM(contact."phone") <> ''
        AND contact."city" IS NOT NULL
        AND BTRIM(contact."city") <> ''
        AND contact."state" IS NOT NULL
        AND BTRIM(contact."state") <> ''
        AND lower(contact."email") ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[a-z]{2,24}$'
        AND lower(contact."email") NOT LIKE '%@example.com'
        AND lower(contact."email") NOT LIKE '%@example.test'
        AND lower(contact."email") NOT LIKE '%.local'
        AND lower(contact."email") NOT LIKE '%dummy%'
        AND lower(contact."email") NOT LIKE '%@test.com'
        AND lower(contact."email") NOT LIKE '%@supercars.test'
    ),
    contact_domains AS (
      SELECT
        active_contacts.*,
        COALESCE(
          (regexp_match(email_host, '([^.]+\\.(?:co|com|net|org)\\.[a-z]{2})$'))[1],
          (regexp_match(email_host, '([^.]+\\.[^.]+)$'))[1]
        ) AS email_root,
        COALESCE(
          (regexp_match(website_host, '([^.]+\\.(?:co|com|net|org)\\.[a-z]{2})$'))[1],
          (regexp_match(website_host, '([^.]+\\.[^.]+)$'))[1]
        ) AS website_root
      FROM active_contacts
    ),
    eligible_contacts AS (
      SELECT type
      FROM contact_domains
      WHERE email_root = website_root
        OR (
          website_host ~ '(^|\\.)(ferraridealers\\.com|preowned\\.ferrari\\.com|lamborghini\\.com|preowned\\.lamborghini\\.com|mclaren\\.com|preowned\\.mclaren\\.com)$'
          AND email_host !~ '(^|\\.)(autotrader\\.com|cars\\.com|dupontregistry\\.com|bringatrailer\\.com|hemmings\\.com|google\\.com|goo\\.gl|maps\\.app\\.goo\\.gl|ferrari\\.com|lamborghini\\.com|mclaren\\.com)$'
        )
    )
    SELECT
      eligible."type",
      COUNT(*)::int AS "eligibleCount",
      (SELECT COUNT(*)::int FROM "PartnerContact" WHERE "active" = TRUE) AS "activeCount"
    FROM eligible_contacts eligible
    GROUP BY eligible."type"
    ORDER BY "eligibleCount" DESC, eligible."type" ASC
  `;

  return {
    activeCount: rows[0]?.activeCount ?? 0,
    eligibleByType: rows.map((row) => ({ type: row.type, value: row.eligibleCount })),
  };
}
