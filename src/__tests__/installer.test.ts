import { describe, it, expect } from "vitest";
import { formatProgressBar } from "../installer.js";

describe("formatProgressBar", () => {
  it("renders 0% at zero downloaded", () => {
    expect(formatProgressBar(0, 100 * 1024 ** 2)).toContain("0%");
  });

  it("renders 50% at half downloaded", () => {
    const total = 100 * 1024 ** 2;
    expect(formatProgressBar(50 * 1024 ** 2, total)).toContain("50%");
  });

  it("renders 100% and clamps when downloaded exceeds total", () => {
    const total = 100 * 1024 ** 2;
    expect(formatProgressBar(total, total)).toContain("100%");
    expect(formatProgressBar(total * 2, total)).toContain("100%"); // never exceeds 100%
  });

  it("includes MB figures for both downloaded and total", () => {
    const result = formatProgressBar(10 * 1024 ** 2, 20 * 1024 ** 2);
    expect(result).toContain("10.0MB");
    expect(result).toContain("20.0MB");
  });
});
