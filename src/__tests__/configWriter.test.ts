import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument, isSeq } from "yaml";
import { patchContinueConfig } from "../configWriter.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "localstack-configwriter-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("patchContinueConfig", () => {
  it("creates a valid config.yaml when none exists", async () => {
    const result = await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });

    expect(result.created).toBe(true);
    const raw = await fs.readFile(result.path, "utf-8");
    const doc = parseDocument(raw);

    expect(doc.get("name")).toBeTruthy();
    expect(doc.get("schema")).toBe("v1");

    const models = doc.get("models", true);
    expect(isSeq(models)).toBe(true);
  });

  it("adds a chat entry and an autocomplete entry with correct roles", async () => {
    const result = await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });

    const raw = await fs.readFile(result.path, "utf-8");
    const doc = parseDocument(raw);
    const models = doc.get("models", true) as any;
    const items = models.items.map((i: any) => i.toJSON());

    const chatEntry = items.find((m: any) => m.model === "qwen2.5-coder:7b");
    const autocompleteEntry = items.find((m: any) => m.model === "qwen2.5-coder:1.5b");

    expect(chatEntry).toBeTruthy();
    expect(chatEntry.provider).toBe("ollama");
    expect(chatEntry.apiBase).toBe("http://localhost:11434");
    expect(chatEntry.roles).toContain("chat");

    expect(autocompleteEntry).toBeTruthy();
    expect(autocompleteEntry.roles).toContain("autocomplete");
  });

  it("preserves an existing model entry the user added themselves", async () => {
    await fs.writeFile(
      path.join(tmpDir, "config.yaml"),
      [
        "name: My Config",
        "version: 1.0.0",
        "schema: v1",
        "models:",
        "  - name: My Claude",
        "    provider: anthropic",
        "    model: claude-sonnet-4-6",
        "    roles:",
        "      - chat",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });

    expect(result.created).toBe(false);
    const raw = await fs.readFile(result.path, "utf-8");
    const doc = parseDocument(raw);
    const models = doc.get("models", true) as any;
    const items = models.items.map((i: any) => i.toJSON());

    // The user's own entry survives untouched.
    const userEntry = items.find((m: any) => m.name === "My Claude");
    expect(userEntry).toBeTruthy();
    expect(userEntry.provider).toBe("anthropic");

    // LocalStack's entries were added alongside it.
    expect(items.some((m: any) => m.model === "qwen2.5-coder:7b")).toBe(true);
    expect(items.some((m: any) => m.model === "qwen2.5-coder:1.5b")).toBe(true);
    expect(items).toHaveLength(3);
  });

  it("updates its own entries in place on a second run instead of duplicating them", async () => {
    await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:3b",
      autocomplete: "qwen2.5-coder:1.5b",
    });

    // Simulate `localstack switch chat 7b`.
    const result = await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });

    const raw = await fs.readFile(result.path, "utf-8");
    const doc = parseDocument(raw);
    const models = doc.get("models", true) as any;
    const items = models.items.map((i: any) => i.toJSON());

    expect(items).toHaveLength(2); // still just chat + autocomplete, not 4
    expect(items.some((m: any) => m.model === "qwen2.5-coder:3b")).toBe(false); // old value gone
    expect(items.some((m: any) => m.model === "qwen2.5-coder:7b")).toBe(true); // new value present
  });

  it("preserves a comment in the existing file (proves round-trip editing, not blind overwrite)", async () => {
    await fs.writeFile(
      path.join(tmpDir, "config.yaml"),
      "# do not remove this comment\nname: My Config\nversion: 1.0.0\nschema: v1\nmodels: []\n",
      "utf-8"
    );

    const result = await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });

    const raw = await fs.readFile(result.path, "utf-8");
    expect(raw).toContain("# do not remove this comment");
  });

  it("writes proper block-style YAML, not flow-style ([a, b]-style inline arrays)", async () => {
    // Regression test: an empty `models: []` in the bootstrap document
    // parses as flow-style, and appended items silently inherited that
    // style, producing unreadable inline-JSON-ish YAML. toJSON()-based
    // structural assertions don't catch this — only checking the raw text does.
    const result = await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });
    const raw = await fs.readFile(result.path, "utf-8");

    expect(raw).toContain("  - name: LocalStack");
    expect(raw).not.toMatch(/models:\s*\[/); // no flow-style array opener
    expect(raw).not.toContain("{ name:"); // no flow-style map opener
  });

  it("does not touch an existing legacy config.json", async () => {
    const jsonPath = path.join(tmpDir, "config.json");
    await fs.writeFile(jsonPath, JSON.stringify({ models: [{ title: "Old" }] }), "utf-8");

    await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });

    const rawJson = await fs.readFile(jsonPath, "utf-8");
    expect(JSON.parse(rawJson)).toEqual({ models: [{ title: "Old" }] });
  });
});
