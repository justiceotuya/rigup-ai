import { describe, it, expect } from "vitest";
import { MODEL_FAMILIES, getModelFamily, DEFAULT_MODEL_FAMILY_ID } from "../modelFamilies.js";
import { modelsForTier } from "../detector.js";

describe("MODEL_FAMILIES registry", () => {
  it("has unique ids", () => {
    const ids = MODEL_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes more than just the default — this is the whole point of the feature", () => {
    expect(MODEL_FAMILIES.length).toBeGreaterThan(1);
  });

  it("every family has at least one tier recommendation", () => {
    for (const family of MODEL_FAMILIES) {
      expect(Object.keys(family.chatByTier).length).toBeGreaterThan(0);
    }
  });

  it("qwen2.5-coder's tiering matches detector.ts's existing default (no silent drift between the two)", () => {
    const family = getModelFamily(DEFAULT_MODEL_FAMILY_ID);
    for (const tier of ["insufficient", "8gb", "16gb"] as const) {
      const fromDetector = modelsForTier(tier);
      expect(family.chatByTier[tier]).toBe(fromDetector.chatAgent);
      expect(family.autocomplete).toBe(fromDetector.autocomplete);
    }
  });
});

describe("getModelFamily", () => {
  it("returns the requested family", () => {
    expect(getModelFamily("starcoder2").label).toBe("StarCoder2");
  });

  it("throws a clear, listing error on an unknown id rather than returning undefined", () => {
    expect(() => getModelFamily("not-a-real-family")).toThrow(/Unknown model family/);
    expect(() => getModelFamily("not-a-real-family")).toThrow(/qwen2\.5-coder/); // lists available ids
  });
});
