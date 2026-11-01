import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { listModels } from "./ollama.js";

/**
 * Ollama serves every model with a 4096-token context unless told
 * otherwise, and silently drops whatever doesn't fit. Agentic extensions
 * like Kilo Code send a long system prompt plus tool schemas on every
 * request, so at 4k the model loses its tool instructions and starts
 * printing tool calls as plain text (seen on real hardware). Kilo's docs
 * ask for at least 32k.
 *
 * Kilo reaches Ollama through its OpenAI-compatible endpoint, which has no
 * way to pass `num_ctx` per request. The portable fix is a model *variant*
 * with the window baked in via a Modelfile: every client that names the
 * variant gets the bigger context, it survives restarts, and it doesn't
 * change the global default for anything else.
 */
export const AGENT_CONTEXT_TOKENS = 32768;

const VARIANT_SUFFIX = /-rigup-(\d+)k$/;

/** `qwen2.5-coder:7b` → `qwen2.5-coder:7b-rigup-32k`. Idempotent. */
export function contextVariantTag(model: string, numCtx: number = AGENT_CONTEXT_TOKENS): string {
  const colon = model.lastIndexOf(":");
  const name = colon === -1 ? model : model.slice(0, colon);
  const tag = colon === -1 ? "latest" : model.slice(colon + 1);
  if (VARIANT_SUFFIX.test(tag)) return model;
  return `${name}:${tag}-rigup-${Math.round(numCtx / 1024)}k`;
}

/** Context size (in tokens) baked into a RigUp variant tag, or null. */
export function variantContextTokens(model: string): number | null {
  const match = model.slice(model.lastIndexOf(":") + 1).match(VARIANT_SUFFIX);
  return match ? Number(match[1]) * 1024 : null;
}

export function modelfileFor(baseModel: string, numCtx: number = AGENT_CONTEXT_TOKENS): string {
  return `FROM ${baseModel}\nPARAMETER num_ctx ${numCtx}\n`;
}

/**
 * Creates the variant if it doesn't exist yet (cheap: it reuses the base
 * model's weights, only a small manifest is written). Returns the tag to
 * configure clients with. The base model must already be pulled.
 */
export async function ensureContextVariant(
  baseModel: string,
  numCtx: number = AGENT_CONTEXT_TOKENS
): Promise<string> {
  const variant = contextVariantTag(baseModel, numCtx);
  if (variant === baseModel) return variant;

  const existing = await listModels();
  if (existing.some((m) => m.name === variant)) return variant;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rigup-modelfile-"));
  const file = path.join(dir, "Modelfile");
  try {
    await fs.writeFile(file, modelfileFor(baseModel, numCtx), "utf-8");
    await execa("ollama", ["create", variant, "-f", file]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  return variant;
}
