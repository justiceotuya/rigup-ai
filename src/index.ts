#!/usr/bin/env node
import { Command } from "commander";
import { CLI_COMMANDS } from "./cliCommands.js";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runSwitch } from "./commands/switch.js";
import { runGuard } from "./commands/guard.js";
import { runAider } from "./commands/aider.js";
import { runUninstall } from "./commands/uninstall.js";
import { runInteractiveLauncher } from "./launcher.js";
import type { Tier } from "./detector.js";

const program = new Command();

program
  .name("localstack")
  .description("Provision and manage a local, offline AI coding stack")
  .version("0.1.0");

// Bare `localstack` / `yarn dev` — don't error; ask which command to run.
program.action(async () => {
  await runInteractiveLauncher();
});

const descriptions = Object.fromEntries(
  CLI_COMMANDS.map((c) => [c.name, c.description])
) as Record<(typeof CLI_COMMANDS)[number]["name"], string>;

program
  .command("init")
  .description(descriptions.init)
  .option("--tier <tier>", "override auto-detected tier (8gb | 16gb)")
  .option(
    "--family <family>",
    "model family to use (qwen2.5-coder | starcoder2 | codegemma | deepseek-coder-v2)"
  )
  .action(async (opts: { tier?: string; family?: string }) => {
    await runInit({ tier: opts.tier as Tier | undefined, family: opts.family });
  });

program
  .command("doctor")
  .description(descriptions.doctor)
  .action(async () => {
    await runDoctor();
  });

program
  .command("switch")
  .description(descriptions.switch)
  .argument("<role>", "chat | autocomplete")
  .argument("<size>", "model size, e.g. 3b, 7b")
  .option("--family <family>", "switch to a different model family entirely")
  .action(async (role: string, size: string, opts: { family?: string }) => {
    await runSwitch(role, size, { family: opts.family });
  });

program
  .command("guard")
  .description(descriptions.guard)
  .argument("<action>", "start | stop")
  .action(async (action: string) => {
    if (action !== "start" && action !== "stop") {
      console.error('Expected "start" or "stop".');
      process.exitCode = 1;
      return;
    }
    await runGuard(action);
  });

program
  .command("aider")
  .description(descriptions.aider)
  .action(async () => {
    await runAider();
  });

program
  .command("uninstall")
  .description(descriptions.uninstall)
  .action(async () => {
    await runUninstall();
  });

await program.parseAsync(process.argv);
