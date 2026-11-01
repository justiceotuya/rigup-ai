import { describe, it, expect } from "vitest";
import { resolveModels } from "../modelResolution.js";

describe("resolveModels", () => {
  it("defaults to qwen2.5-coder when no family is specified", () => {
    const result = resolveModels("8gb");
    expect(result.familyId).toBe("qwen2.5-coder");
    expect(result.chatAgent).toBe("qwen2.5-coder:3b");
    expect(result.warning).toBeUndefined();
  });

  it("resolves a different family when requested", () => {
    const result = resolveModels("16gb", "starcoder2");
    expect(result.chatAgent).toBe("starcoder2:7b");
    expect(result.autocomplete).toBe("starcoder2:3b");
  });

  it("falls back with an explicit warning when a family has no recommendation for the tier", () => {
    // DeepSeek Coder V2 only recommends the 16gb tier.
    const result = resolveModels("8gb", "deepseek-coder-v2");
    expect(result.chatAgent).toBe("deepseek-coder-v2:16b"); // fell back to 16gb's model
    expect(result.warning).toBeTruthy();
    expect(result.warning).toMatch(/no recommendation/i);
  });

  it("sets agentEnabled false only for the insufficient tier, regardless of family", () => {
    expect(resolveModels("insufficient", "qwen2.5-coder").agentEnabled).toBe(false);
    expect(resolveModels("8gb", "qwen2.5-coder").agentEnabled).toBe(true);
    expect(resolveModels("16gb", "starcoder2").agentEnabled).toBe(true);
  });

  it("throws on an unknown family id", () => {
    expect(() => resolveModels("8gb", "not-a-real-family")).toThrow(/Unknown model family/);
  });

  describe("team profile overrides", () => {
    it("a team profile's modelFamily overrides the passed-in family", () => {
      const result = resolveModels("16gb", "qwen2.5-coder", {
        version: 1,
        modelFamily: "codegemma",
      });
      expect(result.familyId).toBe("codegemma");
      expect(result.chatAgent).toBe("codegemma:7b");
    });

    it("a team profile's per-tier chat override wins over the family default", () => {
      const result = resolveModels("16gb", "qwen2.5-coder", {
        version: 1,
        tiers: { "16gb": { chat: "qwen2.5-coder:32b" } },
      });
      expect(result.chatAgent).toBe("qwen2.5-coder:32b");
      expect(result.warning).toBeUndefined(); // an explicit override isn't a fallback
    });

    it("a team profile's per-tier autocomplete override wins over the family default", () => {
      const result = resolveModels("16gb", "qwen2.5-coder", {
        version: 1,
        tiers: { "16gb": { autocomplete: "qwen2.5-coder:0.5b" } },
      });
      expect(result.autocomplete).toBe("qwen2.5-coder:0.5b");
    });

    it("an undefined team profile behaves identically to no team profile", () => {
      const withUndefined = resolveModels("8gb", "qwen2.5-coder", undefined);
      const withNull = resolveModels("8gb", "qwen2.5-coder", null);
      expect(withUndefined).toEqual(withNull);
    });
  });
});
