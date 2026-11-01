import pc from "picocolors";
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { readState, settingsDirs } from "../state.js";
import { ollamaUninstallSteps } from "../uninstallPlan.js";
import {
  introBanner,
  outroSuccess,
  selectUninstallTargets,
  confirmDestructivePhrase,
  confirmDeleteModelWeights,
  stepNote,
  warnNote,
  successNote,
} from "../prompts.js";

const OLLAMA_UNINSTALL_PHRASE = "uninstall ollama";

async function runShellCommand(cmd: string): Promise<void> {
  if (os.platform() === "win32") {
    await execa("cmd", ["/c", cmd], { stdio: "inherit" });
  } else {
    await execa("sh", ["-c", cmd], { stdio: "inherit" });
  }
}

export async function runUninstall(): Promise<void> {
  introBanner();

  const state = await readState();
  const modelSummary = state
    ? [state.models.chatAgent, state.models.autocomplete].filter(Boolean).join(", ")
    : undefined;

  const targets = await selectUninstallTargets(modelSummary);

  if (targets.length === 0) {
    // Only reachable via Ctrl+C / cancel — multiselect is required:true, so
    // Enter-without-Space no longer lands here looking like a silent no-op.
    outroSuccess("Cancelled — nothing removed. 👋");
    return;
  }

  if (targets.includes("models")) {
    if (!state) {
      warnNote("No RigUp AI state found, so there's nothing recorded to remove models for.");
    } else {
      const models = new Set([state.models.chatAgent, state.models.autocomplete].filter(Boolean));
      for (const model of models) {
        stepNote("🗑️ ", `Removing model ${pc.cyan(model)}...`);
        try {
          await execa("ollama", ["rm", model]);
        } catch {
          warnNote(`Couldn't remove ${model} — it may already be gone, or Ollama isn't running.`);
        }
      }
    }
  }

  if (targets.includes("ollama")) {
    const confirmed = await confirmDestructivePhrase(
      OLLAMA_UNINSTALL_PHRASE,
      "This removes Ollama itself, including any background service — every editor integration relying on it will stop working."
    );

    if (!confirmed) {
      warnNote("Skipped removing Ollama — confirmation text didn't match, nothing was touched.");
    } else {
      const steps = ollamaUninstallSteps(os.platform());
      for (const step of steps) {
        stepNote("🦙", step.label);
        for (const cmd of step.commands) {
          try {
            await runShellCommand(cmd);
          } catch {
            warnNote(`This step didn't fully complete (${cmd}) — often fine if it wasn't installed that way.`);
          }
        }
      }

      const deleteWeights = await confirmDeleteModelWeights();
      if (deleteWeights) {
        const ollamaDataDir = path.join(os.homedir(), ".ollama");
        try {
          await fs.rm(ollamaDataDir, { recursive: true, force: true });
          successNote(`Removed ${ollamaDataDir}`);
        } catch {
          warnNote(`Couldn't remove ${ollamaDataDir} — remove it manually if needed.`);
        }
      }
    }
  }

  // State is removed last: if anything above needed to read model names
  // from it, this ordering guarantees that data was still there to read.
  if (targets.includes("state")) {
    // Includes the pre-rename ~/.localstack, which readState() falls back to.
    let removedAll = true;
    for (const dir of settingsDirs()) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        removedAll = false;
        warnNote(`Couldn't remove ${dir} — remove it manually if needed.`);
      }
    }
    if (removedAll) successNote("Removed RigUp AI settings.");
  }

  outroSuccess("Uninstall complete. 👋");
}
