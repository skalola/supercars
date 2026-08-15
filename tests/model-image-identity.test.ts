import assert from "node:assert/strict";
import test from "node:test";
import { evaluateModelImageIdentity } from "../lib/model-catalog/model-image-identity";

test("base-model fallback rejects a different Acura model sharing the same trim label", () => {
  const result = evaluateModelImageIdentity({
    makeName: "Acura",
    modelName: "RSX Type-S",
    siblingModelNames: ["RSX", "RSX Type-S", "TL Type-S"],
    image: {
      source: "BASE_MODEL_FALLBACK",
      sourceName: "Base model fallback from Acura TL Type-S",
    },
  });

  assert.equal(result.status, "REJECTED");
});

test("licensed exact-model photo evidence can be promoted for review", () => {
  const result = evaluateModelImageIdentity({
    makeName: "Acura",
    modelName: "RSX Type-S",
    siblingModelNames: ["RSX", "RSX Type-S", "TL Type-S"],
    image: {
      source: "Openverse",
      sourceName: "Openverse",
      sourceUrl: "https://www.flickr.com/photos/example/rsx",
      attribution: "Owner photo - My 2006 RSX Type-S",
      attributionUrl: "https://www.flickr.com/photos/example",
      license: "CC BY 2.0",
      confidence: 76,
    },
  });

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.exactModelEvidence, true);
});

test("possible sibling aliases are flagged for review instead of auto-rejected", () => {
  const result = evaluateModelImageIdentity({
    makeName: "Mazda",
    modelName: "Eunos Roadster (NA)",
    siblingModelNames: ["Eunos Roadster (NA)", "Miata"],
    image: {
      source: "Openverse",
      sourceName: "Openverse",
      sourceUrl: "https://example.com/mazda-miata",
      attribution: "Mazda Miata",
      license: "CC BY 2.0",
      confidence: 90,
    },
  });

  assert.equal(result.status, "REVIEW");
});
