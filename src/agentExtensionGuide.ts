import type { AgentExtensionCandidate } from "./agentExtensions.js";

/**
 * Deliberately NOT an auto-writer, unlike patchContinueConfig(). Continue.dev
 * documents a single, stable, plain-file config format (config.yaml) that's
 * safe to round-trip edit. Kilo Code / Roo Code / Cline do not have that
 * same guarantee — sources disagree on whether their model config lives in
 * a "kilo.json" file, VS Code's settings.json under namespaced keys, or
 * internal SQLite globalStorage state that VS Code itself owns. Guessing
 * wrong risks silently doing nothing, or in the SQLite case, corrupting a
 * database while the editor has it open.
 *
 * Rather than pick one guess and ship it anyway, this returns accurate
 * manual steps — the Settings-panel flow is consistently documented across
 * all three tools, so it's the one thing that's actually safe to promise.
 */
export function agentExtensionSetupSteps(
  candidate: AgentExtensionCandidate,
  chatModel: string
): string[] {
  // Kilo's current local-Ollama path uses an OpenAI-compatible client
  // (@ai-sdk/openai-compatible in ~/.config/kilo/kilo.jsonc), which appends
  // `/chat/completions` to baseURL. Ollama only exposes that route under
  // `/v1` — `http://localhost:11434/chat/completions` is a real 404
  // ("404 page not found"), verified against a live Ollama daemon.
  const isKilo = candidate.id === "kilocode.kilo-code";
  const baseUrl = isKilo ? "http://localhost:11434/v1" : "http://localhost:11434";

  return [
    `Open ${candidate.label}'s settings — click the gear icon in its sidebar panel.`,
    `Set API Provider to "Ollama" (not "Ollama Cloud", and not a generic OpenAI Compatible entry pointing at the root URL).`,
    `Set Base URL to ${baseUrl} (leave API Key blank — Ollama doesn't need one).${
      isKilo
        ? " The `/v1` suffix is required — without it Kilo calls `/chat/completions` and Ollama returns 404."
        : ""
    }`,
    `Set Model to ${chatModel} (or ollama/${chatModel} if the picker uses that prefix).`,
  ];
}
