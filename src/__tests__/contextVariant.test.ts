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
