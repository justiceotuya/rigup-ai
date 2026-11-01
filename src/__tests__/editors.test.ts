import { describe, it, expect } from "vitest";
import { EDITORS, editorById } from "../editors.js";

describe("EDITORS registry", () => {
  it("includes Cursor alongside VS Code — not VS Code-only", () => {
    const ids = EDITORS.map((e) => e.id);
    expect(ids).toContain("vscode");
    expect(ids).toContain("cursor");
  });

  it("every non-custom editor has a concrete app dir name", () => {
    for (const editor of EDITORS.filter((e) => e.id !== "custom")) {
      expect(editor.appDirName).toBeTruthy();
    }
  });

  it("the custom editor has no fixed app dir name (user supplies it)", () => {
    const custom = editorById("custom");
    expect(custom.appDirName).toBeNull();
  });

  it("every editor has a distinct emoji for the playful prompt UI", () => {
    const emojis = EDITORS.map((e) => e.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });
});

describe("editorById", () => {
  it("throws on an unknown id rather than returning undefined silently", () => {
    // @ts-expect-error intentionally invalid id for the error-path test
    expect(() => editorById("not-a-real-editor")).toThrow();
  });
});
