import { describe, it, expect, vi, beforeEach } from "vitest";

const execaMock = vi.fn();
vi.mock("execa", () => ({ execa: execaMock }));

const { contextVariantTag, variantContextTokens, modelfileFor, ensureContextVariant, AGENT_CONTEXT_TOKENS } =
  await import("../contextVariant.js");

beforeEach(() => execaMock.mockReset());

describe("contextVariantTag", () => {
  it("appends a context suffix to the tag", () => {
    expect(contextVariantTag("qwen2.5-coder:7b")).toBe("qwen2.5-coder:7b-rigup-32k");
    expect(contextVariantTag("qwen3:8b", 16384)).toBe("qwen3:8b-rigup-16k");
  });

  it("treats an untagged model as :latest", () => {
    expect(contextVariantTag("llama3.1")).toBe("llama3.1:latest-rigup-32k");
  });

  it("is idempotent, so re-running init or switch never stacks suffixes", () => {
    expect(contextVariantTag("qwen2.5-coder:7b-rigup-32k")).toBe("qwen2.5-coder:7b-rigup-32k");
  });
});

describe("variantContextTokens", () => {
  it("reads the baked-in context back out of a variant tag", () => {
    expect(variantContextTokens("qwen2.5-coder:7b-rigup-32k")).toBe(AGENT_CONTEXT_TOKENS);
  });
  it("returns null for a plain model", () => {
    expect(variantContextTokens("qwen2.5-coder:7b")).toBeNull();
  });
});

describe("modelfileFor", () => {
  it("bases on the pulled model and sets num_ctx", () => {
    expect(modelfileFor("qwen2.5-coder:7b")).toBe("FROM qwen2.5-coder:7b\nPARAMETER num_ctx 32768\n");
  });
});

describe("ensureContextVariant", () => {
  it("skips `ollama create` when the variant already exists", async () => {
    execaMock.mockResolvedValueOnce({
      stdout: "NAME  ID  SIZE  MODIFIED\nqwen2.5-coder:7b-rigup-32k  abc  4.7GB  now",
    });
    expect(await ensureContextVariant("qwen2.5-coder:7b")).toBe("qwen2.5-coder:7b-rigup-32k");
    expect(execaMock).toHaveBeenCalledTimes(1);
  });

  it("creates the variant from a Modelfile when missing", async () => {
    execaMock.mockResolvedValueOnce({ stdout: "NAME  ID  SIZE  MODIFIED\nqwen2.5-coder:7b  abc  4.7GB  now" });
    execaMock.mockResolvedValueOnce({ stdout: "success" });

    expect(await ensureContextVariant("qwen2.5-coder:7b")).toBe("qwen2.5-coder:7b-rigup-32k");
    const [bin, args] = execaMock.mock.calls[1]!;
    expect(bin).toBe("ollama");
    expect(args.slice(0, 2)).toEqual(["create", "qwen2.5-coder:7b-rigup-32k"]);
    expect(args[2]).toBe("-f");
  });
});

const { kvBytesPerToken, fitContextTokens, planAgentContext } = await import("../contextVariant.js");

const GB = 1024 ** 3;
// Architecture fields as returned by Ollama's /api/show for these models.
const qwen3_8b = {
  "general.architecture": "qwen3",
  "qwen3.block_count": 36,
  "qwen3.attention.head_count": 32,
  "qwen3.attention.head_count_kv": 8,
  "qwen3.attention.key_length": 128,
};
const qwen25coder_7b = {
  "general.architecture": "qwen2",
  "qwen2.block_count": 28,
  "qwen2.attention.head_count": 28,
  "qwen2.attention.head_count_kv": 4,
  "qwen2.embedding_length": 3584,
};

describe("kvBytesPerToken", () => {
  it("computes f16 KV cache size per token from the architecture", () => {
    expect(kvBytesPerToken(qwen3_8b)).toBe(2 * 36 * 8 * 128 * 2); // 147,456 B ≈ 144 KiB
  });
  it("derives head_dim from embedding_length / head_count when key_length is absent", () => {
    expect(kvBytesPerToken(qwen25coder_7b)).toBe(2 * 28 * 4 * 128 * 2);
  });
  it("returns null when the architecture is unknown", () => {
    expect(kvBytesPerToken({})).toBeNull();
  });
});

describe("fitContextTokens", () => {
  it("does not give qwen3:8b a 32k context on a 16 GB machine (the setup that froze a real Mac)", () => {
    const ctx = fitContextTokens({ weightsBytes: 5.2 * GB, kvBytesPerToken: kvBytesPerToken(qwen3_8b)!, totalRamBytes: 16 * GB });
    expect(ctx).toBeLessThan(32768);
    expect(5.2 * GB + ctx * kvBytesPerToken(qwen3_8b)!).toBeLessThanOrEqual(8 * GB);
  });
  it("gives qwen2.5-coder:7b the full 32k on 16 GB (small KV cache)", () => {
    expect(fitContextTokens({ weightsBytes: 4.7 * GB, kvBytesPerToken: kvBytesPerToken(qwen25coder_7b)!, totalRamBytes: 16 * GB })).toBe(32768);
  });
  it("gives qwen3:8b 32k on a 32 GB machine", () => {
    expect(fitContextTokens({ weightsBytes: 5.2 * GB, kvBytesPerToken: kvBytesPerToken(qwen3_8b)!, totalRamBytes: 32 * GB })).toBe(32768);
  });
});

describe("planAgentContext", () => {
  it("warns when the context that fits is below what Kilo's agent needs", () => {
    const plan = planAgentContext({ sizeBytes: 5.2 * GB, modelInfo: qwen3_8b, capabilities: ["completion", "tools"] }, 16 * GB);
    expect(plan.numCtx).toBeLessThan(32768);
    expect(plan.toolCapable).toBe(true);
    expect(plan.warnings.join(" ")).toMatch(/agent tasks will be unreliable/);
  });
  it("flags models Ollama says can't call tools", () => {
    const plan = planAgentContext({ sizeBytes: 4.7 * GB, modelInfo: qwen25coder_7b, capabilities: ["completion", "insert"] }, 16 * GB);
    expect(plan.toolCapable).toBe(false);
    expect(plan.warnings.join(" ")).toMatch(/doesn't support tool calls/);
  });
  it("falls back conservatively when architecture can't be read", () => {
    const plan = planAgentContext({ sizeBytes: null, modelInfo: {}, capabilities: [] }, 16 * GB);
    expect(plan.numCtx).toBe(8192);
    expect(plan.toolCapable).toBeNull();
  });
});
