import type { Tier } from "./detector.js";

export interface ModelFamilyDefinition {
  id: string;
  label: string;
  /** Recommended chat/agent model per hardware tier. Missing tier = not recommended there. */
  chatByTier: Partial<Record<Tier, string>>;
  /** A single lightweight autocomplete model, used regardless of tier. */
  autocomplete: string;
  note?: string;
}

export const DEFAULT_MODEL_FAMILY_ID = "qwen2.5-coder";

/**
 * Verified against Ollama's library (ollama.com/library), not guessed —
 * each tag below is a real, currently-listed model. qwen2.5-coder stays the
 * default since it's what the original design was built around; the others
 * are genuine alternatives with different tradeoffs (license, language
 * coverage, RAM footprint), not filler entries.
 */
export const MODEL_FAMILIES: ModelFamilyDefinition[] = [
  {
    id: "qwen2.5-coder",
    label: "Qwen2.5 Coder",
    chatByTier: {
      insufficient: "qwen2.5-coder:1.5b",
      "8gb": "qwen2.5-coder:3b",
      "16gb": "qwen2.5-coder:7b",
    },
    autocomplete: "qwen2.5-coder:1.5b",
  },
  {
    id: "starcoder2",
    label: "StarCoder2",
    chatByTier: {
      "8gb": "starcoder2:3b",
      "16gb": "starcoder2:7b",
    },
    autocomplete: "starcoder2:3b",
    note: "Trained on 600+ languages under a permissive license — a good pick when licensing matters more than raw quality. No sub-3B variant, so it isn't recommended below the 8gb tier.",
  },
  {
    id: "codegemma",
    label: "CodeGemma",
    chatByTier: {
      insufficient: "codegemma:2b",
      "8gb": "codegemma:2b",
      "16gb": "codegemma:7b",
    },
    autocomplete: "codegemma:2b",
    note: "Google's lightweight coding model family, tuned for fill-in-the-middle completion — a solid alternative to Qwen.",
  },
  {
    id: "deepseek-coder-v2",
    label: "DeepSeek Coder V2",
    chatByTier: {
      "16gb": "deepseek-coder-v2:16b",
    },
    autocomplete: "qwen2.5-coder:1.5b",
    note: "A 16B-class Mixture-of-Experts model — strong quality but genuinely needs the 16gb tier. It has no lightweight autocomplete variant of its own, so autocomplete borrows Qwen's.",
  },
];

export function getModelFamily(id: string): ModelFamilyDefinition {
  const found = MODEL_FAMILIES.find((f) => f.id === id);
  if (!found) {
    const available = MODEL_FAMILIES.map((f) => f.id).join(", ");
    throw new Error(`Unknown model family "${id}". Available: ${available}`);
  }
  return found;
}
