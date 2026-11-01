import * as p from "@clack/prompts";
import pc from "picocolors";
import { EDITORS, type EditorId } from "./editors.js";
import { MODEL_FAMILIES } from "./modelFamilies.js";
import { CLI_COMMANDS, type CliCommandName } from "./cliCommands.js";

export interface EditorChoice {
  id: EditorId;
  customAppDirName?: string;
}

function bail(): never {
  p.cancel("👋 No worries — setup cancelled. Run `rigup init` again whenever you're ready.");
  process.exit(1);
}

export function introBanner(): void {
  p.intro(
    `${pc.bgMagenta(pc.black(pc.bold(" 🚀 RigUp AI ")))} ${pc.cyan(
      "let's get your local AI coding stack humming ✨"
    )}`
  );
}

export function outroSuccess(message: string): void {
  p.outro(`${pc.green("✅ " + message)}`);
}

export function outroError(message: string): void {
  p.outro(`${pc.red("💥 " + message)}`);
}

/**
 * The core editor-agnostic prompt — asks which editor the user is on and
 * returns enough info (id + optional custom app-dir name) for paths.ts to
 * resolve the right config locations for it.
 */
const BACK = Symbol("back");

export async function selectEditor(): Promise<EditorChoice> {
  // Loop rather than a single pass so choosing "Something else" and then
  // backing out of the follow-up text prompt returns here instead of
  // aborting the whole command.
  while (true) {
    const choice = await p.select({
      message: `🎨 ${pc.bold("Which editor are you using?")}`,
      options: EDITORS.map((e) => ({
        value: e.id,
        label: `${e.emoji}  ${e.label}`,
      })),
    });

    if (p.isCancel(choice)) bail();

    if (choice === "custom") {
      const name = await p.text({
        message: `🧩 ${pc.bold("What's the app-data folder name for your editor?")} ${pc.gray("(Esc to go back)")}`,
        placeholder: "e.g. MyEditor — check %APPDATA% / ~/.config for the exact name",
        validate: (value) => (value.trim().length === 0 ? "Can't be empty! 🙈" : undefined),
      });
      if (p.isCancel(name)) continue; // back to the editor list, not a full exit
      return { id: "custom", customAppDirName: name as string };
    }

    return { id: choice as EditorId };
  }
}

export async function confirmInstallOllama(): Promise<boolean> {
  const answer = await p.confirm({
    message: `🦙 ${pc.bold("Ollama isn't installed yet — want RigUp AI to grab it for you?")}`,
    active: "Yes, install it! 🚀",
    inactive: "No, I'll do it myself",
  });
  if (p.isCancel(answer)) bail();
  return answer as boolean;
}

export function stepNote(emoji: string, message: string): void {
  p.log.step(`${emoji} ${message}`);
}

export function warnNote(message: string): void {
  p.log.warn(`⚠️  ${pc.yellow(message)}`);
}

export function successNote(message: string): void {
  p.log.success(`🎉 ${pc.green(message)}`);
}

/**
 * `allowBack` adds an explicit "⬅ Go back" entry at the top of the list
 * and returns the BACK sentinel if chosen, rather than a real family id —
 * only meaningful when this is reached from within another menu (i.e.
 * from selectModelChoice below); callers that use this standalone have no
 * parent to return to, so they leave allowBack unset.
 */
export async function selectModelFamily(
  currentFamilyId?: string,
  allowBack = false
): Promise<string | typeof BACK> {
  const options: { value: string; label: string; hint?: string }[] = allowBack
    ? [{ value: "__back__", label: "⬅  Go back" }]
    : [];
  options.push(
    ...MODEL_FAMILIES.map((f) => ({
      value: f.id,
      label: f.label,
      hint: f.note,
    }))
  );

  const choice = await p.select({
    message: `🔀 ${pc.bold("Which model family?")}`,
    initialValue: currentFamilyId,
    options,
  });
  if (p.isCancel(choice)) bail();
  return choice === "__back__" ? BACK : (choice as string);
}

export type ModelSelectionChoice =
  | { type: "recommended" }
  | { type: "family"; familyId: string }
  | { type: "custom"; chatAgent: string; autocomplete: string }
  | { type: "changeEditor" };

/**
 * The core of "let people pick a model for their RAM size, but default to
 * what the design doc recommends" — recommendedChat/recommendedAutocomplete
 * are whatever resolveModels() already picked (doc default, or a team
 * profile override if one applies), and that's the pre-selected option.
 * Picking "family" or "custom" is an explicit opt-out, not the default path.
 *
 * Wrapped in a loop so backing out of the family picker, or cancelling
 * either custom-tag text prompt, returns to this top-level menu instead of
 * aborting the whole `init` run. "Change editor" is the one option that
 * doesn't resolve locally — it's the link back to a genuinely earlier step
 * (editor selection), so it's returned to the caller (runInit) to act on.
 */
export async function selectModelChoice(
  tierLabel: string,
  recommendedChat: string,
  recommendedAutocomplete: string
): Promise<ModelSelectionChoice> {
  while (true) {
    const choice = await p.select({
      message: `🧠 ${pc.bold(`Recommended for your ${tierLabel} tier`)}: ${pc.cyan(
        recommendedChat
      )} (chat/agent) + ${pc.cyan(recommendedAutocomplete)} (autocomplete)`,
      options: [
        { value: "recommended" as const, label: "✅ Use the recommended models" },
        { value: "family" as const, label: "🔀 Pick a different model family" },
        { value: "custom" as const, label: "✏️  Enter model tags manually" },
        { value: "changeEditor" as const, label: "⬅  Actually, change my editor" },
      ],
    });

    if (p.isCancel(choice)) bail();

    if (choice === "changeEditor") {
      return { type: "changeEditor" };
    }

    if (choice === "family") {
      const familyChoice = await selectModelFamily(undefined, true);
      if (familyChoice === BACK) continue; // re-show this menu
      return { type: "family", familyId: familyChoice };
    }

    if (choice === "custom") {
      const chatAgent = await p.text({
        message: `Chat/agent model tag ${pc.gray("(Esc to go back)")}`,
        placeholder: recommendedChat,
      });
      if (p.isCancel(chatAgent)) continue; // back to this menu

      const autocomplete = await p.text({
        message: `Autocomplete model tag ${pc.gray("(Esc to go back)")}`,
        placeholder: recommendedAutocomplete,
      });
      if (p.isCancel(autocomplete)) continue; // back to this menu

      return {
        type: "custom",
        chatAgent: (chatAgent as string).trim() || recommendedChat,
        autocomplete: (autocomplete as string).trim() || recommendedAutocomplete,
      };
    }

    return { type: "recommended" };
  }
}

export async function confirmInstallExtension(editorLabel: string, extensionLabel: string): Promise<boolean> {
  const answer = await p.confirm({
    message: `🧩 ${pc.bold(`Install ${extensionLabel} for ${editorLabel} now?`)}`,
    active: "Yes, install it! 🚀",
    inactive: "No, I'll do it myself",
  });
  if (p.isCancel(answer)) return false;
  return answer as boolean;
}

export async function confirmContinueSetup(): Promise<boolean> {
  const answer = await p.confirm({
    message: `🦙 ${pc.bold("Ollama is ready! Continue setting up RigUp AI now?")}`,
    active: "Yes, continue 🚀",
    inactive: "Not now",
    initialValue: true,
  });
  if (p.isCancel(answer)) return false;
  return answer as boolean;
}

export type UninstallTarget = "state" | "models" | "ollama";

/**
 * Returns [] both when the user explicitly picks nothing and when they
 * cancel (Ctrl+C) — callers treat both as "do nothing," which is the safe
 * default for a destructive command.
 */
export async function selectUninstallTargets(
  modelSummary?: string
): Promise<UninstallTarget[]> {
  const selection = await p.multiselect({
    message: `🧹 ${pc.bold("What would you like to remove?")} ${pc.dim("(Space to select, Enter to confirm)")}`,
    options: [
      { value: "state" as const, label: "🗂️  RigUp AI settings (~/.rigup)" },
      {
        value: "models" as const,
        label: `🧠 Models RigUp AI pulled${modelSummary ? ` (${modelSummary})` : ""}`,
      },
      {
        value: "ollama" as const,
        label: "🦙 Ollama itself — the whole local AI server (needs sudo/admin, irreversible)",
      },
    ],
    required: true,
  });

  if (p.isCancel(selection)) return [];
  return selection as UninstallTarget[];
}

/**
 * Pure comparison so the confirmation logic is testable without simulating
 * a real TTY (arrow-key/text prompts need raw terminal mode, which piped
 * stdin in a test harness can't reliably provide).
 */
export function matchesConfirmPhrase(typed: string, phrase: string): boolean {
  return typed.trim().toLowerCase() === phrase.toLowerCase();
}

/**
 * A stricter "type the exact phrase" confirmation for the genuinely
 * destructive step (removing Ollama system-wide) — a plain y/N is too easy
 * to reflexively confirm for something this irreversible.
 */
export async function confirmDestructivePhrase(phrase: string, warningMessage: string): Promise<boolean> {
  const typed = await p.text({
    message: `⚠️  ${pc.red(pc.bold(warningMessage))}\n   Type "${pc.bold(phrase)}" to confirm:`,
    placeholder: phrase,
  });
  if (p.isCancel(typed)) return false;
  return matchesConfirmPhrase(typed as string, phrase);
}

export async function confirmDeleteModelWeights(): Promise<boolean> {
  const answer = await p.confirm({
    message:
      "🧽 Also delete downloaded model weights in ~/.ollama? This frees the most disk space and can't be undone.",
    initialValue: false,
  });
  if (p.isCancel(answer)) return false;
  return answer as boolean;
}

/**
 * Interactive command picker for the bare `rigup` / `yarn dev`
 * invocation (no subcommand given). Returns null on cancel so the caller
 * can exit cleanly instead of erroring out.
 */
export async function selectCliCommand(): Promise<CliCommandName | null> {
  const choice = await p.select({
    message: `🧭 ${pc.bold("Which command do you want to run?")}`,
    options: CLI_COMMANDS.map((cmd) => ({
      value: cmd.name,
      label: cmd.name,
      hint: cmd.description,
    })),
  });
  if (p.isCancel(choice)) return null;
  return choice as CliCommandName;
}

export async function promptSwitchArgs(): Promise<{ role: "chat" | "autocomplete"; size: string } | null> {
  const role = await p.select({
    message: `🎭 ${pc.bold("Which role are you switching?")}`,
    options: [
      { value: "chat" as const, label: "chat", hint: "chat / agent model" },
      { value: "autocomplete" as const, label: "autocomplete", hint: "inline completion model" },
    ],
  });
  if (p.isCancel(role)) return null;

  const size = await p.text({
    message: `📏 ${pc.bold("Model size tag?")}`,
    placeholder: "7b",
    validate: (value) => {
      if (!value.trim()) return "Size is required (e.g. 3b, 7b).";
    },
  });
  if (p.isCancel(size)) return null;

  return { role: role as "chat" | "autocomplete", size: (size as string).trim() };
}

export async function promptGuardAction(): Promise<"start" | "stop" | null> {
  const action = await p.select({
    message: `🛡️  ${pc.bold("Guard action?")}`,
    options: [
      { value: "start" as const, label: "start", hint: "begin watching for overlapping heavy model jobs" },
      { value: "stop" as const, label: "stop", hint: "stop the guard watcher" },
    ],
  });
  if (p.isCancel(action)) return null;
  return action as "start" | "stop";
}
