import { describe, it, expect } from "vitest";
import { matchesConfirmPhrase } from "../prompts.js";

describe("matchesConfirmPhrase", () => {
  const phrase = "uninstall ollama";

  it("matches an exact typed phrase", () => {
    expect(matchesConfirmPhrase("uninstall ollama", phrase)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesConfirmPhrase("Uninstall Ollama", phrase)).toBe(true);
    expect(matchesConfirmPhrase("UNINSTALL OLLAMA", phrase)).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(matchesConfirmPhrase("  uninstall ollama  ", phrase)).toBe(true);
  });

  it("rejects anything that doesn't match, including partial/near matches", () => {
    expect(matchesConfirmPhrase("nope", phrase)).toBe(false);
    expect(matchesConfirmPhrase("uninstall", phrase)).toBe(false);
    expect(matchesConfirmPhrase("yes", phrase)).toBe(false);
    expect(matchesConfirmPhrase("", phrase)).toBe(false);
  });
});
