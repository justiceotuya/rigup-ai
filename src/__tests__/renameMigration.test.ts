import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "yaml";
import { patchContinueConfig } from "../configWriter.js";
import { readState, defaultState } from "../state.js";

/**
 * The project was renamed from "LocalStack" to "RigUp AI". Existing users
 * have state in ~/.localstack and Continue entries named "LocalStack — …";
 * these tests pin the migration so an upgrade never orphans or duplicates them.
 */
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rigup-migration-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("rename migration", () => {
  it("falls back to the legacy ~/.localstack state when no new state exists", async () => {
    const legacy = path.join(tmpDir, "legacy", "state.json");
    await fs.mkdir(path.dirname(legacy), { recursive: true });
    const state = { ...defaultState(), ramGb: 16, tier: "16gb" as const };
    await fs.writeFile(legacy, JSON.stringify(state));

    const result = await readState(path.join(tmpDir, "new", "state.json"), legacy);
    expect(result?.ramGb).toBe(16);
  });

  it("prefers the new state file when both exist", async () => {
    const legacy = path.join(tmpDir, "legacy.json");
    const current = path.join(tmpDir, "current.json");
    await fs.writeFile(legacy, JSON.stringify({ ...defaultState(), ramGb: 8 }));
    await fs.writeFile(current, JSON.stringify({ ...defaultState(), ramGb: 32 }));

    expect((await readState(current, legacy))?.ramGb).toBe(32);
  });

  it("returns null when neither state file exists", async () => {
    expect(await readState(path.join(tmpDir, "a.json"), path.join(tmpDir, "b.json"))).toBeNull();
  });

  it("updates legacy 'LocalStack' Continue entries in place instead of duplicating them", async () => {
    await fs.writeFile(
      path.join(tmpDir, "config.yaml"),
      [
        "name: Mine",
        "version: 1.0.0",
        "schema: v1",
        "models:",
        "  - name: LocalStack — Chat/Agent (Ollama)",
        "    provider: ollama",
        "    model: qwen2.5-coder:3b",
        "  - name: LocalStack — Autocomplete (Ollama)",
        "    provider: ollama",
        "    model: qwen2.5-coder:0.5b",
        "",
      ].join("\n"),
    );

    const result = await patchContinueConfig(tmpDir, {
      chatAgent: "qwen2.5-coder:7b",
      autocomplete: "qwen2.5-coder:1.5b",
    });
    const models = parseDocument(await fs.readFile(result.path, "utf-8")).toJS().models as {
      name: string;
      model: string;
    }[];

    expect(models).toHaveLength(2);
    expect(models.map((m) => m.name)).toEqual([
      "RigUp AI — Chat/Agent (Ollama)",
      "RigUp AI — Autocomplete (Ollama)",
    ]);
    expect(models[0]?.model).toBe("qwen2.5-coder:7b");
  });
});
