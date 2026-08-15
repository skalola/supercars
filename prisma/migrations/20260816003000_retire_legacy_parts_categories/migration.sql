-- Preserve all catalog relationships while retiring obsolete top-level parts containers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PartComponentType" component
    JOIN "PartCategory" category ON category.id = component."categoryId"
    WHERE category.slug IN ('aero-body', 'drivetrain', 'fueling', 'interior-safety', 'performance-modifications')
  ) THEN
    RAISE EXCEPTION 'Legacy parts categories contain component definitions; run the taxonomy reconciliation before this migration.';
  END IF;
END $$;

WITH routes(old_slug, new_slug) AS (
  VALUES
    ('aero-body', 'aerodynamics'),
    ('drivetrain', 'transmission-drivetrain'),
    ('fueling', 'fuel-system'),
    ('interior-safety', 'interior'),
    ('performance-modifications', 'performance-packages')
)
UPDATE "PerformancePart" item
SET "categoryId" = target.id,
    "updatedAt" = NOW()
FROM routes
JOIN "PartCategory" source ON source.slug = routes.old_slug
JOIN "PartCategory" target ON target.slug = routes.new_slug
WHERE item."categoryId" = source.id;

WITH routes(old_slug, new_slug) AS (
  VALUES
    ('aero-body', 'aerodynamics'),
    ('drivetrain', 'transmission-drivetrain'),
    ('fueling', 'fuel-system'),
    ('interior-safety', 'interior'),
    ('performance-modifications', 'performance-packages')
)
UPDATE "VehicleInstalledPart" item
SET "categoryId" = target.id,
    "updatedAt" = NOW()
FROM routes
JOIN "PartCategory" source ON source.slug = routes.old_slug
JOIN "PartCategory" target ON target.slug = routes.new_slug
WHERE item."categoryId" = source.id;

WITH routes(old_slug, new_slug) AS (
  VALUES
    ('aero-body', 'aerodynamics'),
    ('drivetrain', 'transmission-drivetrain'),
    ('fueling', 'fuel-system'),
    ('interior-safety', 'interior'),
    ('performance-modifications', 'performance-packages')
)
UPDATE "PartCatalogNode" item
SET "categoryId" = target.id,
    "updatedAt" = NOW()
FROM routes
JOIN "PartCategory" source ON source.slug = routes.old_slug
JOIN "PartCategory" target ON target.slug = routes.new_slug
WHERE item."categoryId" = source.id;

WITH routes(old_slug, new_slug) AS (
  VALUES
    ('aero-body', 'aerodynamics'),
    ('drivetrain', 'transmission-drivetrain'),
    ('fueling', 'fuel-system'),
    ('interior-safety', 'interior'),
    ('performance-modifications', 'performance-packages')
)
UPDATE "PreferredPartBrand" item
SET "componentCategoryId" = target.id,
    "updatedAt" = NOW()
FROM routes
JOIN "PartCategory" source ON source.slug = routes.old_slug
JOIN "PartCategory" target ON target.slug = routes.new_slug
WHERE item."componentCategoryId" = source.id;

UPDATE "PartCategory"
SET active = false,
    "updatedAt" = NOW()
WHERE slug IN ('aero-body', 'drivetrain', 'fueling', 'interior-safety', 'performance-modifications');
