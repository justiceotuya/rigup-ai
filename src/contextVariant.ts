import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { listModels, getModelFacts, type ModelFacts } from "./ollama.js";

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

/**
 * A fixed 32k froze a 16 GB Mac on real hardware: qwen3:8b's KV cache at
 * 32k is ~4.5 GB on top of ~5 GB of weights, before the editor, the
 * autocomplete model and the OS. So the context is sized per model from
 * its architecture, keeping the chat model within this share of RAM.
 */
export const CHAT_MODEL_RAM_SHARE = 0.5;
const CONTEXT_STEPS = [32768, 24576, 16384, 12288, 8192, 4096];

/**
 * f16 KV cache bytes per token: 2 (K and V) × layers × kv_heads × head_dim × 2 bytes.
 * Returns null when the architecture fields aren't available.
 */
export function kvBytesPerToken(modelInfo: Record<string, unknown>): number | null {
  const arch = typeof modelInfo["general.architecture"] === "string" ? modelInfo["general.architecture"] : null;
  if (!arch) return null;
  const num = (key: string): number | null => {
    const v = modelInfo[`${arch}.${key}`];
    return typeof v === "number" && v > 0 ? v : null;
  };
  const layers = num("block_count");
  const heads = num("attention.head_count");
  const kvHeads = num("attention.head_count_kv") ?? heads;
  const headDim = num("attention.key_length") ?? (num("embedding_length") && heads ? num("embedding_length")! / heads : null);
  if (!layers || !kvHeads || !headDim) return null;
  return 2 * layers * kvHeads * headDim * 2;
}

/** Largest context step whose weights + KV cache fit in the chat model's RAM share. */
export function fitContextTokens(input: {
  weightsBytes: number;
  kvBytesPerToken: number;
  totalRamBytes: number;
  share?: number;
}): number {
  const budget = input.totalRamBytes * (input.share ?? CHAT_MODEL_RAM_SHARE) - input.weightsBytes;
  for (const step of CONTEXT_STEPS) {
    if (step * input.kvBytesPerToken <= budget) return step;
  }
  return CONTEXT_STEPS[CONTEXT_STEPS.length - 1]!;
}

/** Below this, real-hardware testing found Kilo's agent unreliable with any model that fits. */
export const AGENT_RECOMMENDED_RAM_BYTES = 32 * 1024 ** 3;

export interface AgentContextPlan {
  numCtx: number;
  toolCapable: boolean | null;
  /** False when this machine/model combination can't be expected to drive Kilo's agent. */
  agentReliable: boolean;
  /** Why the plan falls short of what an agent needs, if it does. */
  warnings: string[];
}

export function planAgentContext(facts: ModelFacts, totalRamBytes: number): AgentContextPlan {
  const warnings: string[] = [];
  const kv = kvBytesPerToken(facts.modelInfo);
  let numCtx: number;
  if (kv && facts.sizeBytes) {
    numCtx = fitContextTokens({ weightsBytes: facts.sizeBytes, kvBytesPerToken: kv, totalRamBytes });
  } else {
    // Can't estimate: stay conservative rather than risk freezing the machine.
    numCtx = totalRamBytes >= 32 * 1024 ** 3 ? 16384 : 8192;
    warnings.push("Couldn't read this model's architecture from Ollama, so a conservative context was chosen.");
  }
  if (numCtx < AGENT_CONTEXT_TOKENS) {
    warnings.push(
      `Only ${numCtx / 1024}k context fits in your RAM for this model; Kilo Code's agent needs ${AGENT_CONTEXT_TOKENS / 1024}k, so agent tasks will be unreliable. Chat and autocomplete in Continue.dev are unaffected.`
    );
  }
  const toolCapable = facts.capabilities.length > 0 ? facts.capabilities.includes("tools") : null;
  if (toolCapable === false) {
    warnings.push("Ollama reports this model doesn't support tool calls, which Kilo Code's agent relies on.");
  }
  if (totalRamBytes < AGENT_RECOMMENDED_RAM_BYTES) {
    warnings.push(
      "Kilo Code's agent works best with 24–30B models, which need about 32 GB of RAM or more. On this machine, local models usually can't drive the agent reliably (in testing on 16 GB they printed tool calls as text, and a larger model froze the Mac)."
    );
  }
  const agentReliable =
    numCtx >= AGENT_CONTEXT_TOKENS && toolCapable !== false && totalRamBytes >= AGENT_RECOMMENDED_RAM_BYTES;
  return { numCtx, toolCapable, agentReliable, warnings };
}

/** Fetches the model's facts and plans a context that fits this machine. */
export async function planForModel(model: string, totalRamBytes: number = os.totalmem()): Promise<AgentContextPlan> {
  return planAgentContext(await getModelFacts(model), totalRamBytes);
}

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
