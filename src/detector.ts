import os from "node:os";

export type Tier = "insufficient" | "8gb" | "16gb";

export interface HardwareInfo {
  totalRamGb: number;
  platform: NodeJS.Platform;
  tier: Tier;
}

export interface ModelSet {
  chatAgent: string;
  autocomplete: string;
  agentEnabled: boolean;
}

/**
 * Bytes -> GB, rounded to 1 decimal. Kept as its own function so it's
 * trivially testable against known conversion values.
 */
export function bytesToGb(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

/**
 * Pure tiering logic: given total RAM, decide which hardware tier applies.
 * Conservative on purpose — leaves headroom for the OS + editor, does not
 * assume every byte of RAM is available to the model.
 */
export function tierFromRamGb(ramGb: number): Tier {
  if (ramGb < 8) return "insufficient";
  if (ramGb < 16) return "8gb";
  return "16gb";
}

/**
 * Maps a hardware tier to the recommended model set, per the design spec:
 * - insufficient: agent features disabled, autocomplete-only warning
 * - 8gb: qwen2.5-coder:3b (chat/agent) + qwen2.5-coder:1.5b (autocomplete)
 * - 16gb: qwen2.5-coder:7b (chat/agent) + qwen2.5-coder:1.5b (autocomplete)
 */
export function modelsForTier(tier: Tier): ModelSet {
  switch (tier) {
    case "insufficient":
      return {
        chatAgent: "qwen2.5-coder:1.5b",
        autocomplete: "qwen2.5-coder:1.5b",
        agentEnabled: false,
      };
    case "8gb":
      return {
        chatAgent: "qwen2.5-coder:3b",
        autocomplete: "qwen2.5-coder:1.5b",
        agentEnabled: true,
      };
    case "16gb":
      return {
        chatAgent: "qwen2.5-coder:7b",
        autocomplete: "qwen2.5-coder:1.5b",
        agentEnabled: true,
      };
  }
}

/**
 * Detects the current machine's hardware profile. Accepts an optional
 * override tier (for `rigup init --tier 8gb`) so callers don't need
 * a second code path for manual overrides.
 */
export function detectHardware(overrideTier?: Tier): HardwareInfo {
  const totalRamGb = bytesToGb(os.totalmem());
  const tier = overrideTier ?? tierFromRamGb(totalRamGb);

  return {
    totalRamGb,
    platform: os.platform(),
    tier,
  };
}
