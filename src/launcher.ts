import * as p from "@clack/prompts";
import { runAider } from "./commands/aider.js";
import { runDoctor } from "./commands/doctor.js";
import { runGuard } from "./commands/guard.js";
import { runInit } from "./commands/init.js";
import { runSwitch } from "./commands/switch.js";
import { runUninstall } from "./commands/uninstall.js";
import {
  promptGuardAction,
  promptSwitchArgs,
  selectCliCommand,
} from "./prompts.js";

/**
 * Interactive entry when the user runs the CLI with no subcommand
 * (`yarn dev` / bare `rigup`). Lists every command and dispatches
 * to the matching handler — prompting for required args where needed.
 */
export async function runInteractiveLauncher(): Promise<void> {
  const command = await selectCliCommand();
  if (!command) {
    p.cancel("👋 No command selected.");
    return;
  }

  switch (command) {
    case "init":
      await runInit({});
      return;
    case "doctor":
      await runDoctor();
      return;
    case "aider":
      await runAider();
      return;
    case "uninstall":
      await runUninstall();
      return;
    case "switch": {
      const args = await promptSwitchArgs();
      if (!args) {
        p.cancel("👋 Switch cancelled.");
        return;
      }
      await runSwitch(args.role, args.size);
      return;
    }
    case "guard": {
      const action = await promptGuardAction();
      if (!action) {
        p.cancel("👋 Guard cancelled.");
        return;
      }
      await runGuard(action);
      return;
    }
  }
}