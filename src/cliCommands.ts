/**
 * Single source of truth for LocalStack subcommands — used by the
 * interactive launcher (`yarn dev` / bare `localstack`) and kept in sync
 * with the Commander registrations in index.ts by tests.
 */
export type CliCommandName =
  | "init"
  | "doctor"
  | "switch"
  | "guard"
  | "aider"
  | "uninstall";

export interface CliCommand {
  name: CliCommandName;
  description: string;
}

export const CLI_COMMANDS: readonly CliCommand[] = [
  {
    name: "init",
    description: "Detect hardware, pull models, wire up editor configs",
  },
  {
    name: "doctor",
    description: "Re-validate the setup: ollama reachable, models present, configs valid",
  },
  {
    name: "switch",
    description: "Switch a role's model without a full re-init",
  },
  {
    name: "guard",
    description: "Watch for overlapping heavy model jobs and warn about RAM contention",
  },
  {
    name: "aider",
    description: "Launch aider pre-wired to your configured chat/agent model",
  },
  {
    name: "uninstall",
    description: "Remove LocalStack settings, pulled models, and/or Ollama itself",
  },
] as const;
