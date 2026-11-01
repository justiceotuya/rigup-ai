import { describe, it, expect } from "vitest";
import { bytesToGb, tierFromRamGb, modelsForTier } from "../detector.js";

describe("bytesToGb", () => {
  it("converts bytes to GB rounded to 1 decimal", () => {
    expect(bytesToGb(8 * 1024 ** 3)).toBe(8);
    expect(bytesToGb(17179869184)).toBe(16); // 16GB exactly
  });
});

describe("tierFromRamGb", () => {
  it("flags below-8GB machines as insufficient", () => {
    expect(tierFromRamGb(4)).toBe("insufficient");
    expect(tierFromRamGb(7.9)).toBe("insufficient");
  });

  it("puts 8GB up to (not including) 16GB in the 8gb tier", () => {
    expect(tierFromRamGb(8)).toBe("8gb");
    expect(tierFromRamGb(12)).toBe("8gb");
    expect(tierFromRamGb(15.9)).toBe("8gb");
  });

  it("puts 16GB and above in the 16gb tier", () => {
    expect(tierFromRamGb(16)).toBe("16gb");
    expect(tierFromRamGb(32)).toBe("16gb");
  });
});

describe("modelsForTier", () => {
  it("disables agent features and downgrades chat model when insufficient", () => {
    const models = modelsForTier("insufficient");
    expect(models.agentEnabled).toBe(false);
    expect(models.chatAgent).toBe("qwen2.5-coder:1.5b");
  });

  it("recommends 3b chat/agent model + 1.5b autocomplete for 8gb tier", () => {
    const models = modelsForTier("8gb");
    expect(models.chatAgent).toBe("qwen2.5-coder:3b");
    expect(models.autocomplete).toBe("qwen2.5-coder:1.5b");
    expect(models.agentEnabled).toBe(true);
  });

  it("recommends 7b chat/agent model + 1.5b autocomplete for 16gb tier", () => {
    const models = modelsForTier("16gb");
    expect(models.chatAgent).toBe("qwen2.5-coder:7b");
    expect(models.autocomplete).toBe("qwen2.5-coder:1.5b");
    expect(models.agentEnabled).toBe(true);
  });
});
