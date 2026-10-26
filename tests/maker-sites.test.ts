import assert from "node:assert/strict";
import test from "node:test";
import { MAKER_SITE_CONFIGS, getMakerSlugFromHostname } from "@/lib/maker-sites/config";

test("every configured maker has a unique live hostname and flagship", () => {
  assert.equal(MAKER_SITE_CONFIGS.length, 26);
  assert.equal(new Set(MAKER_SITE_CONFIGS.map((maker) => maker.slug)).size, MAKER_SITE_CONFIGS.length);
  assert.equal(new Set(MAKER_SITE_CONFIGS.map((maker) => maker.hostname)).size, MAKER_SITE_CONFIGS.length);
  assert.deepEqual(
    MAKER_SITE_CONFIGS.map((maker) => maker.displayName),
    MAKER_SITE_CONFIGS.map((maker) => maker.displayName).toSorted((left, right) => left.localeCompare(right)),
  );

  for (const maker of MAKER_SITE_CONFIGS) {
    assert.equal(maker.enabled, true);
    assert.ok(maker.flagshipModelSlug);
    assert.match(maker.hostname, /^[a-z0-9-]+\.supercardash\.com$/);
  }
});

test("production and local maker hostnames resolve to the same catalog slug", () => {
  for (const maker of MAKER_SITE_CONFIGS) {
    const localHostname = `${maker.hostname.split(".")[0]}.localhost:3010`;
    assert.equal(getMakerSlugFromHostname(maker.hostname), maker.slug);
    assert.equal(getMakerSlugFromHostname(localHostname), maker.slug);
  }

  assert.equal(getMakerSlugFromHostname("supercardash.com"), null);
  assert.equal(getMakerSlugFromHostname("unknown.supercardash.com"), null);
});
