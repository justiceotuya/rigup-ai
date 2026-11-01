import pc from "picocolors";
import os from "node:os";
import { detectHardware, type Tier } from "../detector.js";
import { writeState, defaultState } from "../state.js";
import { isOllamaAvailable, ensureModel, ensureOllamaServerRunning, testGenerate } from "../ollama.js";
import { installOllama } from "../installer.js";
import {
  introBanner,
  outroSuccess,
  outroError,
  selectEditor,
  confirmInstallOllama,
  confirmContinueSetup,
  selectModelChoice,
  stepNote,
  warnNote,
  successNote,
} from "../prompts.js";
import { editorById } from "../editors.js";
import { continueConfigDir, globalStorageDir } from "../paths.js";
import { patchContinueConfig } from "../configWriter.js";
import { discoverAgentExtensions } from "../extensionDiscovery.js";
import { agentExtensionSetupSteps } from "../agentExtensionGuide.js";
import { resolveModels } from "../modelResolution.js";
import { findTeamProfile } from "../teamProfile.js";
import { DEFAULT_MODEL_FAMILY_ID, getModelFamily } from "../modelFamilies.js";
import { findAgentExtensionCandidate } from "../agentExtensions.js";
import { CONTINUE_EXTENSION } from "../continueExtension.js";
import { offerExtensionInstall } from "../offerExtensionInstall.js";
import { patchKiloConfig } from "../kiloConfigWriter.js";

export interface InitOptions {
  tier?: Tier;
  family?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * On macOS/Linux, installOllama() already awaited the official install
 * script running to completion (stdio inherited, not detached) — the
 * binary is genuinely on disk by the time it resolves. The only real
 * uncertainty is whether *this* process's PATH already covers wherever it
 * landed (almost always yes, since install locations like /usr/local/bin
 * are standard and this process inherited its PATH from the shell that
 * launched it) — so a short retry loop, not a hard requirement to restart
 * the terminal, is the honest amount of caution here.
 */
export async function waitForOllama(retries = 5, delayMs = 1000): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await isOllamaAvailable()) return true;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return false;
}

export async function runInit(options: InitOptions): Promise<void> {
  introBanner();

  const hw = detectHardware(options.tier);
  stepNote(
    "🖥️ ",
    `Detected ${pc.bold(`${hw.totalRamGb}GB RAM`)} on ${pc.bold(hw.platform)} → tier ${pc.cyan(hw.tier)}`
  );

  if (hw.tier === "insufficient") {
    warnNote(
      "Under 8GB RAM detected — agent features (Kilo Code, Roo Code, Cline) will be disabled. Only lightweight autocomplete is recommended on this machine."
    );
  }

  const teamProfileResult = await findTeamProfile(process.cwd());
  if (teamProfileResult) {
    stepNote(
      "👥",
      `Found team config at ${pc.gray(teamProfileResult.path)} — using its settings as the baseline.`
    );
  }

  if (options.family) {
    try {
      getModelFamily(options.family);
    } catch (err) {
      outroError((err as Error).message);
      process.exitCode = 1;
      return;
    }
  }

  let editorChoice = await selectEditor();
  let editorDef = editorById(editorChoice.id);
  stepNote(editorDef.emoji, `Configuring for ${pc.bold(editorDef.label)}`);

  const ollamaOk = await isOllamaAvailable();
  if (!ollamaOk) {
    const shouldInstall = await confirmInstallOllama();
    if (!shouldInstall) {
      outroError(
        "Skipped. Install Ollama manually from https://ollama.com, then re-run `localstack init`."
      );
      process.exitCode = 1;
      return;
    }

    const installed = await installOllama();
    if (!installed) {
      outroError(
        "Automatic install didn't complete. Install manually from https://ollama.com, then re-run `localstack init`."
      );
      process.exitCode = 1;
      return;
    }

    if (os.platform() === "win32") {
      outroSuccess(
        "Ollama installer launched — finish the setup window, then re-run `localstack init` to continue automatically. 🦙"
      );
      return;
    }

    stepNote("🔁", "Checking whether Ollama is ready...");
    const ready = await waitForOllama();
    if (!ready) {
      outroSuccess(
        "Ollama installed, but isn't detected in this shell session yet. Open a new terminal and re-run `localstack init` to continue. 🦙"
      );
      return;
    }

    const shouldContinue = await confirmContinueSetup();
    if (!shouldContinue) {
      outroSuccess("No problem — run `localstack init` again whenever you're ready to continue. 👋");
      return;
    }
  }

  // The binary existing (isOllamaAvailable) is not the same thing as the
  // *server* being up and reachable — `ollama --version` never talks to
  // localhost:11434 at all. Skipping this check is exactly how someone
  // ends up with Ollama fully "installed" but every client (Continue.dev,
  // Kilo Code, this tool's own model pulls) getting a fetch/connection
  // error against a server that was never actually running.
  stepNote("🔌", "Checking whether the Ollama server is running...");
  const serverReady = await ensureOllamaServerRunning();
  if (!serverReady) {
    outroError(
      "Couldn't get the Ollama server running. Try `ollama serve` in another terminal, then re-run `localstack init`."
    );
    process.exitCode = 1;
    return;
  }
  stepNote("✅", "Ollama server is up and reachable.");

  const resolved = resolveModels(
    hw.tier,
    options.family ?? DEFAULT_MODEL_FAMILY_ID,
    teamProfileResult?.profile
  );
  if (resolved.warning) warnNote(resolved.warning);

  let finalModels = resolved;
  if (!options.family) {
    while (true) {
      const choice = await selectModelChoice(hw.tier, resolved.chatAgent, resolved.autocomplete);

      if (choice.type === "changeEditor") {
        editorChoice = await selectEditor();
        editorDef = editorById(editorChoice.id);
        stepNote(editorDef.emoji, `Configuring for ${pc.bold(editorDef.label)}`);
        continue;
      }

      if (choice.type === "family") {
        finalModels = resolveModels(hw.tier, choice.familyId, teamProfileResult?.profile);
        if (finalModels.warning) warnNote(finalModels.warning);
      } else if (choice.type === "custom") {
        finalModels = {
          chatAgent: choice.chatAgent,
          autocomplete: choice.autocomplete,
          agentEnabled: hw.tier !== "insufficient",
          familyId: "custom",
        };
      }
      break;
    }
  }

  stepNote(
    "🧠",
    `Model plan (${pc.bold(finalModels.familyId)}) → chat/agent: ${pc.cyan(finalModels.chatAgent)}, autocomplete: ${pc.cyan(finalModels.autocomplete)}`
  );

  for (const model of new Set([finalModels.chatAgent, finalModels.autocomplete])) {
    stepNote("📦", `Pulling ${pc.cyan(model)}...`);
    await ensureModel(model);
  }

  // Continue.dev: safe to auto-patch — it documents a single, stable,
  // plain-file config format we can round-trip edit without guessing.
  // Separately, offer to install the marketplace extension itself via the
  // editor CLI (same contract as Kilo Code) so the config file isn't inert.
  let continueConfigured = false;
  let continueConfigWrittenPath: string | undefined;
  try {
    const result = await patchContinueConfig(continueConfigDir(), {
      chatAgent: finalModels.chatAgent,
      autocomplete: finalModels.autocomplete,
    });
    continueConfigured = true;
    continueConfigWrittenPath = result.path;
    stepNote(
      "💙",
      `${result.created ? "Created" : "Updated"} Continue.dev config → ${pc.gray(result.path)}`
    );
  } catch (err) {
    warnNote(
      `Couldn't write Continue.dev config (${(err as Error).message}) — you'll need to wire it up manually.`
    );
  }

  const continueInstall = await offerExtensionInstall({
    editorId: editorChoice.id,
    editorLabel: editorDef.label,
    extensionId: CONTINUE_EXTENSION.id,
    extensionLabel: CONTINUE_EXTENSION.label,
    manualUrl: CONTINUE_EXTENSION.manualUrl,
    afterInstallSteps: [
      "Open the Continue panel — the LocalStack chat/agent and autocomplete models should already be listed from the config file above.",
    ],
  });
  if (continueInstall === "already-installed") {
    stepNote("💙", `Continue.dev extension already installed in ${editorDef.label}.`);
  }

  // Kilo Code specifically is safe to auto-configure — confirmed against
  // its own docs (kilo.ai/docs/ai-providers/ollama,
  // kilo.ai/docs/code-with-ai/agents/custom-models): global config lives
  // at ~/.config/kilo/kilo.jsonc on every platform, a stable documented
  // format, unlike Roo Code/Cline where the storage mechanism was never
  // confirmed (see agentExtensionGuide.ts) — those still get guided manual
  // steps rather than a writer. Installing the extension binary itself
  // (via the editor CLI, offerExtensionInstall) is safe for all three;
  // only the settings write is Kilo-specific.
  async function configureKiloAndTest(): Promise<void> {
    try {
      const result = await patchKiloConfig(finalModels.chatAgent);
      successNote(
        `${result.created ? "Created" : "Updated"} Kilo Code config → ${result.path}`
      );
    } catch (err) {
      warnNote(`Couldn't write Kilo Code config (${(err as Error).message}) — set it up manually.`);
      return;
    }

    stepNote(
      "🧪",
      `Sending a test prompt to ${pc.cyan(finalModels.chatAgent)} to confirm it's actually working...`
    );
    const test = await testGenerate(finalModels.chatAgent);
    if (test.ok) {
      const preview = test.response?.trim().replace(/\s+/g, " ").slice(0, 80);
      successNote(`Connected and responding${preview ? `: "${preview}"` : "."}`);
    } else {
      warnNote(
        `Test prompt failed (${test.error}). Kilo Code's config is set, but the model may not be answering yet — try again in a moment, or check \`localstack doctor\`.`
      );
    }
  }

  const agentMatches = await discoverAgentExtensions(
    globalStorageDir(editorChoice.id, editorChoice.customAppDirName)
  );

  if (agentMatches.length === 0) {
    const kiloCandidate = findAgentExtensionCandidate("kilocode.kilo-code");
    if (kiloCandidate) {
      const kiloInstall = await offerExtensionInstall({
        editorId: editorChoice.id,
        editorLabel: editorDef.label,
        extensionId: kiloCandidate.id,
        extensionLabel: kiloCandidate.label,
        manualUrl: "https://kilo.ai",
        // No afterInstallSteps here — configureKiloAndTest() below writes
        // the config directly instead of printing manual steps for it.
      });

      // Whether it was already there (globalStorage folder just hadn't
      // been created yet — e.g. installed but never opened) or freshly
      // installed just now, either way it's present: configure it.
      if (kiloInstall === "already-installed" || kiloInstall === "installed") {
        if (kiloInstall === "already-installed") {
          stepNote(
            "🧩",
            `${kiloCandidate.label} already installed in ${editorDef.label} — configuring it.`
          );
        }
        await configureKiloAndTest();
      }
    } else {
      warnNote(
        `No agentic coding extension detected for ${editorDef.label} (Kilo Code / Roo Code / Cline). Install one if you want multi-file agent edits — Kilo Code is the actively maintained option: https://kilo.ai`
      );
    }
  } else {
    for (const match of agentMatches) {
      if (match.candidate.id === "kilocode.kilo-code") {
        stepNote("🧩", `Found ${match.candidate.label} — configuring it automatically.`);
        await configureKiloAndTest();
        continue;
      }

      const steps = agentExtensionSetupSteps(match.candidate, finalModels.chatAgent);
      stepNote(
        "🧩",
        `Found ${match.candidate.label} — LocalStack doesn't auto-configure this one (its settings storage isn't consistently documented), so wire it up manually:`
      );
      steps.forEach((step, i) => console.log(pc.gray(`   ${i + 1}. ${step}`)));
      if (match.candidate.status === "discontinued") {
        warnNote(match.candidate.note ?? `${match.candidate.label} is discontinued.`);
      }
    }
  }

  const state = defaultState();
  state.ramGb = hw.totalRamGb;
  state.os = hw.platform;
  state.tier = hw.tier;
  state.editor = editorChoice.customAppDirName
    ? { id: editorChoice.id, customAppDirName: editorChoice.customAppDirName }
    : { id: editorChoice.id };
  state.models = { chatAgent: finalModels.chatAgent, autocomplete: finalModels.autocomplete };
  state.modelFamily = finalModels.familyId;
  state.integrations.continue = {
    configured: continueConfigured,
    path: continueConfigWrittenPath,
  };
  await writeState(state);

  successNote("Done! Run `localstack doctor` to verify the setup.");
}
