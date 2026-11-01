import pc from "picocolors";
import { readState, writeState } from "../state.js";
import { isOllamaAvailable, isServerReachable, listModels } from "../ollama.js";
import { editorById } from "../editors.js";
import { globalStorageDir } from "../paths.js";
import { discoverAgentExtensions } from "../extensionDiscovery.js";

type CheckResult = { label: string; ok: boolean; detail?: string };

export async function runDoctor(): Promise<void> {
  console.log(pc.bold("🩺 RigUp AI doctor\n"));

  const results: CheckResult[] = [];

  const state = await readState();
  results.push({
    label: "State manifest (~/.rigup/state.json)",
    ok: state !== null,
    detail: state === null ? "Not found — run `rigup init` first." : undefined,
  });

  if (state) {
    const editorDef = editorById(state.editor.id);
    console.log(pc.gray(`   Configured for: ${editorDef.emoji} ${editorDef.label}\n`));
  }

  const ollamaInstalled = await isOllamaAvailable();
  results.push({
    label: "Ollama installed (binary on PATH)",
    ok: ollamaInstalled,
    detail: ollamaInstalled ? undefined : "Not found. Run `rigup init` to install it.",
  });

  // Deliberately a separate check from the one above: the binary existing
  // doesn't mean the server is actually up and answering requests. This is
  // the exact gap that used to produce a "fetch failed" error in
  // Continue.dev / Kilo Code with no clear diagnosis from `doctor` — the
  // binary check alone would report green while the server was down.
  const serverUp = ollamaInstalled ? await isServerReachable() : false;
  results.push({
    label: "Ollama server reachable (localhost:11434)",
    ok: serverUp,
    detail: !ollamaInstalled
      ? "Can't check — Ollama isn't installed."
      : serverUp
        ? undefined
        : "Installed but not running. Try `ollama serve`, or re-run `rigup init`.",
  });

  if (serverUp && state) {
    const installed = await listModels();
    const installedNames = new Set(installed.map((m) => m.name));
    for (const [role, modelName] of Object.entries(state.models)) {
      const present = installedNames.has(modelName);
      results.push({
        label: `Model present: ${modelName} (${role})`,
        ok: present,
        detail: present ? undefined : "Run `rigup init` to pull missing models.",
      });
    }
  }

  if (state) {
    const editorDef = editorById(state.editor.id);
    results.push({
      label: `${editorDef.label} config (Continue.dev)`,
      ok: state.integrations.continue.configured,
      detail: state.integrations.continue.configured
        ? undefined
        : "Not yet configured (config writer not implemented).",
    });

    // Scan for whichever agentic extension is actually installed, rather
    // than assuming Roo Code specifically — Roo Code itself was archived
    // and discontinued on May 15, 2026, so asserting it's present would be
    // checking for the wrong thing on plenty of real machines now.
    const dir = globalStorageDir(state.editor.id, state.editor.customAppDirName);
    const matches = await discoverAgentExtensions(dir);

    if (matches.length === 0) {
      results.push({
        label: `${editorDef.label} agentic extension (Roo Code / Kilo Code / Cline)`,
        ok: false,
        detail: "None found. Kilo Code is the actively maintained option: https://kilo.ai",
      });
    } else {
      for (const match of matches) {
        const discontinued = match.candidate.status === "discontinued";
        results.push({
          // Found and usable either way — "discontinued" is a heads-up
          // about future support, not a broken setup, so it doesn't fail
          // the check on its own.
          label: `${editorDef.label} agentic extension: ${match.candidate.label}`,
          ok: true,
          detail: discontinued ? `⚠️  ${match.candidate.note}` : undefined,
        });
      }
    }
  }

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.label}${r.detail ? pc.gray(` — ${r.detail}`) : ""}`);
  }

  const allOk = results.every((r) => r.ok);

  if (state) {
    await writeState({ ...state, lastHealthCheck: new Date().toISOString() });
  }

  console.log(
    allOk
      ? pc.green("\n🎉 All checks passed!")
      : pc.yellow("\n🤔 Some checks failed — see details above.")
  );

  if (!allOk) process.exitCode = 1;
}
