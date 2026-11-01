import pc from "picocolors";
import { readState, writeState } from "../state.js";
import { ensureModel, testGenerate } from "../ollama.js";
import { continueConfigDir, globalStorageDir } from "../paths.js";
import { patchContinueConfig } from "../configWriter.js";
import { discoverAgentExtensions } from "../extensionDiscovery.js";
import { agentExtensionSetupSteps } from "../agentExtensionGuide.js";
import { getModelFamily } from "../modelFamilies.js";
import { patchKiloConfig } from "../kiloConfigWriter.js";
import { ensureContextVariant } from "../contextVariant.js";

export interface SwitchOptions {
  family?: string;
}

/**
 * `rigup switch chat 7b` — swap a single role's model without
 * redoing hardware detection or the full init flow. Role is "chat" or
 * "autocomplete"; size is a bare tag suffix like "3b" / "7b". Defaults to
 * whichever family is already recorded in state; pass --family to switch
 * families entirely (e.g. `rigup switch chat 7b --family starcoder2`).
 */
export async function runSwitch(role: string, size: string, options: SwitchOptions = {}): Promise<void> {
  if (role !== "chat" && role !== "autocomplete") {
    console.log(pc.red(`Unknown role "${role}" — expected "chat" or "autocomplete".`));
    process.exitCode = 1;
    return;
  }

  const state = await readState();
  if (!state) {
    console.log(pc.red("No RigUp AI state found — run `rigup init` first."));
    process.exitCode = 1;
    return;
  }

  const familyId = options.family ?? state.modelFamily;
  try {
    getModelFamily(familyId); // validate before touching anything
  } catch (err) {
    console.log(pc.red((err as Error).message));
    process.exitCode = 1;
    return;
  }

  const modelName = `${familyId}:${size}`;
  console.log(`Switching ${role} model to ${pc.cyan(modelName)}...`);
  await ensureModel(modelName);

  if (role === "chat") {
    state.models.chatAgent = modelName;
  } else {
    state.models.autocomplete = modelName;
  }
  state.modelFamily = familyId;

  try {
    const result = await patchContinueConfig(continueConfigDir(), {
      chatAgent: state.models.chatAgent,
      autocomplete: state.models.autocomplete,
    });
    state.integrations.continue = { configured: true, path: result.path };
    console.log(pc.gray(`Updated Continue.dev config → ${result.path}`));
  } catch (err) {
    console.log(pc.yellow(`Couldn't update Continue.dev config: ${(err as Error).message}`));
  }

  await writeState(state);

  if (role === "chat") {
    const matches = await discoverAgentExtensions(
      globalStorageDir(state.editor.id, state.editor.customAppDirName)
    );
    for (const match of matches) {
      if (match.candidate.id === "kilocode.kilo-code") {
        let kiloModel = modelName;
        try {
          kiloModel = await ensureContextVariant(modelName);
        } catch (err) {
          console.log(
            pc.yellow(`Couldn't create a 32k-context variant (${(err as Error).message}); Kilo will get Ollama's 4k default.`)
          );
        }
        try {
          const result = await patchKiloConfig(kiloModel);
          console.log(pc.gray(`Updated Kilo Code config → ${result.path} (model ${kiloModel})`));
          if (result.updatedModes.length > 0) {
            console.log(pc.gray(`  Also moved Kilo modes to ${kiloModel}: ${result.updatedModes.join(", ")}`));
          }
        } catch (err) {
          console.log(pc.yellow(`Couldn't update Kilo Code config: ${(err as Error).message}`));
          continue;
        }

        console.log(pc.gray(`Sending a test prompt to ${kiloModel}...`));
        const test = await testGenerate(kiloModel);
        if (test.ok) {
          console.log(pc.green(`Connected and responding.`));
        } else {
          console.log(
            pc.yellow(
              `Test prompt failed (${test.error}) — the config is set, but check \`rigup doctor\`.`
            )
          );
        }
        continue;
      }

      console.log(
        pc.yellow(
          `\n${match.candidate.label} doesn't auto-update — set its Model to ${pc.cyan(modelName)} manually:`
        )
      );
      agentExtensionSetupSteps(match.candidate, modelName).forEach((step, i) =>
        console.log(pc.gray(`   ${i + 1}. ${step}`))
      );
    }
  }

  console.log(pc.green(`\nDone. Run \`rigup doctor\` to verify.`));
}
