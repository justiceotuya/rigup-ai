import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";

let tmpHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "rigup-kilo-"));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  // os.homedir() reads HOME on macOS/Linux but USERPROFILE on Windows; set
  // both so these tests never touch the real ~/.config/kilo/kilo.jsonc.
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(async () => {
  restoreEnv("HOME", originalHome);
  restoreEnv("USERPROFILE", originalUserProfile);
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function restoreEnv(key: string, value: string | undefined): void {
  // Assigning undefined would set the literal string "undefined".
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("kiloConfigPath", () => {
  it("resolves to ~/.config/kilo/kilo.jsonc — confirmed against Kilo's own docs, not guessed", async () => {
    const { kiloConfigPath } = await import("../kiloConfigWriter.js");
    expect(kiloConfigPath()).toBe(path.join(tmpHome, ".config", "kilo", "kilo.jsonc"));
  });
});

describe("patchKiloConfig", () => {
  it("creates a valid kilo.jsonc when none exists", async () => {
    const { patchKiloConfig, kiloConfigPath } = await import("../kiloConfigWriter.js");
    const result = await patchKiloConfig("qwen2.5-coder:7b");

    expect(result.created).toBe(true);
    expect(result.path).toBe(kiloConfigPath());

    const raw = await fs.readFile(result.path, "utf-8");
    const parsed = parseJsonc(raw);
    expect(parsed.model).toBe("ollama/qwen2.5-coder:7b");
    expect(parsed.provider.ollama.models["qwen2.5-coder:7b"]).toBeTruthy();
  });

  it("sets the model selection and registers it under provider.ollama.models", async () => {
    const { patchKiloConfig } = await import("../kiloConfigWriter.js");
    const result = await patchKiloConfig("codegemma:7b");

    const raw = await fs.readFile(result.path, "utf-8");
    const parsed = parseJsonc(raw);
    expect(parsed.model).toBe("ollama/codegemma:7b");
    expect(parsed.provider.ollama.models["codegemma:7b"].name).toContain("codegemma:7b");
  });

  it("sets provider.ollama.options.baseURL to the /v1 suffix — Kilo's client needs it or gets a real 404", async () => {
    // Regression test: Kilo's local-Ollama path is an OpenAI-compatible
    // client that calls `/chat/completions`, which only exists under
    // Ollama's `/v1` route. Verified against a live Ollama daemon
    // (see the comment in kiloConfigWriter.ts) — the bare root 404s.
    const { patchKiloConfig } = await import("../kiloConfigWriter.js");
    const result = await patchKiloConfig("qwen2.5-coder:7b");

    const raw = await fs.readFile(result.path, "utf-8");
    const parsed = parseJsonc(raw);
    expect(parsed.provider.ollama.options.baseURL).toBe("http://localhost:11434/v1");
  });

  it("setting baseURL preserves other existing provider.ollama.options untouched", async () => {
    const { patchKiloConfig, kiloConfigPath } = await import("../kiloConfigWriter.js");
    const configPath = kiloConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        { provider: { ollama: { options: { timeout: 600000 } } } },
        null,
        2
      )
    );

    const result = await patchKiloConfig("qwen2.5-coder:7b");
    const raw = await fs.readFile(result.path, "utf-8");
    const parsed = parseJsonc(raw);

    expect(parsed.provider.ollama.options.baseURL).toBe("http://localhost:11434/v1");
    expect(parsed.provider.ollama.options.timeout).toBe(600000); // untouched
  });

  it("does NOT fabricate tool_call or limit — those are real per-model facts, not safe to guess", async () => {
    const { patchKiloConfig } = await import("../kiloConfigWriter.js");
    const result = await patchKiloConfig("qwen2.5-coder:7b");

    const raw = await fs.readFile(result.path, "utf-8");
    const parsed = parseJsonc(raw);
    const entry = parsed.provider.ollama.models["qwen2.5-coder:7b"];
    expect(entry.tool_call).toBeUndefined();
    expect(entry.limit).toBeUndefined();
  });

  it("preserves an existing provider's config untouched (e.g. an anthropic entry)", async () => {
    const { patchKiloConfig, kiloConfigPath } = await import("../kiloConfigWriter.js");
    const configPath = kiloConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          model: "anthropic/claude-sonnet-4-6",
          provider: {
            anthropic: { options: { apiKey: "{env:ANTHROPIC_API_KEY}" } },
          },
        },
        null,
        2
      )
    );

    const result = await patchKiloConfig("qwen2.5-coder:7b");
    expect(result.created).toBe(false);

    const raw = await fs.readFile(result.path, "utf-8");
    const parsed = parseJsonc(raw);

    // RigUp AI's own change is applied...
    expect(parsed.model).toBe("ollama/qwen2.5-coder:7b");
    expect(parsed.provider.ollama.models["qwen2.5-coder:7b"]).toBeTruthy();
    // ...but the user's existing anthropic config survives untouched.
    expect(parsed.provider.anthropic.options.apiKey).toBe("{env:ANTHROPIC_API_KEY}");
  });

  it("preserves comments in an existing file (proves round-trip editing, not blind overwrite)", async () => {
    const { patchKiloConfig, kiloConfigPath } = await import("../kiloConfigWriter.js");
    const configPath = kiloConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      '{\n  // do not remove this comment\n  "model": "openai/gpt-5"\n}\n'
    );

    const result = await patchKiloConfig("qwen2.5-coder:7b");
    const raw = await fs.readFile(result.path, "utf-8");
    expect(raw).toContain("// do not remove this comment");
  });

  it("updates its own registered model in place on a second run instead of duplicating providers", async () => {
    const { patchKiloConfig } = await import("../kiloConfigWriter.js");

    await patchKiloConfig("qwen2.5-coder:3b");
    const result = await patchKiloConfig("qwen2.5-coder:7b"); // simulate `rigup switch`

    const raw = await fs.readFile(result.path, "utf-8");
    const parsed = parseJsonc(raw);

    expect(parsed.model).toBe("ollama/qwen2.5-coder:7b"); // updated to the new selection
    expect(Object.keys(parsed.provider.ollama.models)).toContain("qwen2.5-coder:3b"); // old registration still there, harmless
    expect(Object.keys(parsed.provider.ollama.models)).toContain("qwen2.5-coder:7b");
  });
  it("moves per-mode overrides that followed the old default, leaving deliberate ones alone", async () => {
    // Shape taken from a real kilo.jsonc after `rigup init` + Kilo's own setup.
    const { patchKiloConfig, kiloConfigPath } = await import("../kiloConfigWriter.js");
    const configPath = kiloConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          model: "ollama/qwen2.5-coder:7b",
          agent: {
            code: { model: "ollama/qwen2.5-coder:7b" },
            ask: { model: "ollama/qwen2.5-coder:7b" },
            debug: { model: "ollama/qwen2.5-coder:7b" },
            orchestrator: { model: "ollama/qwen2.5-coder:7b" },
            plan: { model: "anthropic/claude-sonnet-4-6" }, // chosen on purpose
            custom: {}, // no model set: inherits the default
          },
        },
        null,
        2
      )
    );

    const result = await patchKiloConfig("qwen2.5-coder:3b"); // simulate `rigup switch chat 3b`
    const parsed = parseJsonc(await fs.readFile(result.path, "utf-8"));

    expect(parsed.model).toBe("ollama/qwen2.5-coder:3b");
    expect(result.updatedModes.sort()).toEqual(["ask", "code", "debug", "orchestrator"]);
    for (const mode of ["code", "ask", "debug", "orchestrator"]) {
      expect(parsed.agent[mode].model).toBe("ollama/qwen2.5-coder:3b");
    }
    expect(parsed.agent.plan.model).toBe("anthropic/claude-sonnet-4-6");
    expect(parsed.agent.custom.model).toBeUndefined();
  });

  it("reports no updated modes on a fresh config", async () => {
    const { patchKiloConfig } = await import("../kiloConfigWriter.js");
    const result = await patchKiloConfig("qwen2.5-coder:7b");
    expect(result.updatedModes).toEqual([]);
  });
  it("records context and tool support for RigUp's own variants (unknown to Kilo's catalog)", async () => {
    const { patchKiloConfig } = await import("../kiloConfigWriter.js");
    const result = await patchKiloConfig("qwen3:8b-rigup-16k", { contextTokens: 16384, toolCall: true });
    const entry = parseJsonc(await fs.readFile(result.path, "utf-8")).provider.ollama.models["qwen3:8b-rigup-16k"];
    expect(entry.tool_call).toBe(true);
    expect(entry.limit).toEqual({ context: 16384, output: 4096 });
  });
});
