import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { modify, applyEdits } from "jsonc-parser";

export interface KiloPatchResult {
  path: string;
  created: boolean;
}

const FORMATTING = { insertSpaces: true, tabSize: 2, eol: "\n" };

/**
 * Kilo's local-Ollama path uses an OpenAI-compatible client
 * (@ai-sdk/openai-compatible under the hood in kilo.jsonc), which appends
 * `/chat/completions` to whatever baseURL is configured. Ollama only
 * exposes that route under `/v1` — the bare root (`http://localhost:11434`)
 * 404s on `/chat/completions`. Verified against a live Ollama daemon
 * (real-hardware testing caught this, not just doc-reading), and confirmed
 * against the same root cause documented in agentExtensionGuide.ts's
 * manual steps for Kilo Code specifically. Earlier versions of this writer
 * omitted an explicit baseURL, assuming Ollama's default was already what
 * Kilo used — that assumption was wrong for this specific provider.
 */
const KILO_OLLAMA_BASE_URL = "http://localhost:11434/v1";

/**
 * Confirmed directly against Kilo Code's own docs
 * (https://kilo.ai/docs/ai-providers/ollama, https://kilo.ai/docs/code-with-ai/agents/custom-models):
 * global config lives at ~/.config/kilo/kilo.jsonc on every platform,
 * including Windows — NOT %APPDATA%, unlike most VS Code extensions. This
 * is what unblocked auto-configuring Kilo Code specifically: Roo Code and
 * Cline don't have this same first-party confirmation, so they still get
 * guided manual steps (see agentExtensionGuide.ts) rather than a writer.
 */
export function kiloConfigPath(): string {
  return path.join(os.homedir(), ".config", "kilo", "kilo.jsonc");
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Patches (or creates) Kilo Code's kilo.jsonc to select and register an
 * Ollama model, using jsonc-parser's modify/applyEdits — the same
 * comment-preserving, merge-not-overwrite approach VS Code itself uses for
 * settings.json, so nothing else in an existing config (other providers,
 * comments, custom models) gets disturbed.
 *
 * Deliberately does NOT set `tool_call`, `limit.context`, or `limit.output`
 * — those are real per-model facts (does this specific tag support
 * function calling? what's its actual trained context window?) that vary
 * across model families and aren't safe to guess. Kilo's own catalog
 * (models.dev) fills in reasonable defaults when it recognizes the model;
 * for anything it doesn't recognize, the person should set these
 * deliberately once they know how the model behaves, not have LocalStack
 * assert facts about it that might be wrong.
 */
export async function patchKiloConfig(chatModel: string): Promise<KiloPatchResult> {
  const configPath = kiloConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  const created = !(await fileExists(configPath));
  let text = created ? "{\n}\n" : await fs.readFile(configPath, "utf-8");

  text = applyEdits(text, modify(text, ["model"], `ollama/${chatModel}`, { formattingOptions: FORMATTING }));
  text = applyEdits(
    text,
    modify(
      text,
      ["provider", "ollama", "models", chatModel],
      { name: `${chatModel} (LocalStack)` },
      { formattingOptions: FORMATTING }
    )
  );
  // Targets the single leaf field rather than replacing the whole
  // `options` object, so any other Ollama-provider-level option the person
  // already has set (timeout, chunkTimeout, etc.) survives untouched.
  text = applyEdits(
    text,
    modify(
      text,
      ["provider", "ollama", "options", "baseURL"],
      KILO_OLLAMA_BASE_URL,
      { formattingOptions: FORMATTING }
    )
  );

  await fs.writeFile(configPath, text, "utf-8");
  return { path: configPath, created };
}
