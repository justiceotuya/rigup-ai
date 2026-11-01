import type { Tier } from "./detector.js";
import { getModelFamily, DEFAULT_MODEL_FAMILY_ID } from "./modelFamilies.js";
import type { TeamProfile } from "./teamProfile.js";

export interface ResolvedModels {
  chatAgent: string;
  autocomplete: string;
  agentEnabled: boolean;
  familyId: string;
  /** Set when a fallback was needed — surface this to the user, don't swallow it. */
  warning?: string;
}

/**
 * Resolution order: an explicit --family flag wins, then a team profile's
 * modelFamily, then the built-in default. Per-tier model overrides in a
 * team profile (tiers.<tier>.chat/autocomplete) apply on top of whichever
 * family that resolves to.
 */
export function resolveModels(
  tier: Tier,
  familyId: string = DEFAULT_MODEL_FAMILY_ID,
  teamProfile?: TeamProfile | null
): ResolvedModels {
  const effectiveFamilyId = teamProfile?.modelFamily ?? familyId;
  const family = getModelFamily(effectiveFamilyId);

  const overrideChat = teamProfile?.tiers?.[tier]?.chat;
  const overrideAutocomplete = teamProfile?.tiers?.[tier]?.autocomplete;

  let chatAgent = overrideChat ?? family.chatByTier[tier];
  let warning: string | undefined;

  if (!chatAgent) {
    // This family has no recommendation at this tier (e.g. DeepSeek Coder
    // V2 on an 8gb machine) — fall back to its lightest available tier
    // rather than silently picking something arbitrary, and say so.
    const tierOrder: Tier[] = ["8gb", "16gb"];
    const fallbackTier = tierOrder.find((t) => family.chatByTier[t]);

    if (fallbackTier) {
      chatAgent = family.chatByTier[fallbackTier]!;
      warning = `${family.label} has no recommendation for the "${tier}" tier — falling back to its "${fallbackTier}" model (${chatAgent}). This may be slower or use more RAM than ideal.`;
    } else {
      const anyModel = Object.values(family.chatByTier)[0];
      chatAgent = anyModel ?? `${effectiveFamilyId}:latest`;
      warning = `${family.label} has no tier recommendations at all — using ${chatAgent} as a last resort.`;
    }
  }

  return {
    chatAgent,
    autocomplete: overrideAutocomplete ?? family.autocomplete,
    agentEnabled: tier !== "insufficient",
    familyId: effectiveFamilyId,
    warning,
  };
}
