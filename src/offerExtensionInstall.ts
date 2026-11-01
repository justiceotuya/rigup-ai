import pc from "picocolors";
import type { EditorId } from "./editors.js";
import {
  editorCliBinary,
  installExtensionViaCli,
  isEditorCliAvailable,
  isExtensionInstalledViaCli,
} from "./editorCli.js";
import { confirmInstallExtension, stepNote, successNote, warnNote } from "./prompts.js";

export type OfferExtensionInstallResult =
  | "already-installed"
  | "installed"
  | "declined"
  | "failed"
  | "cli-unavailable";

export interface OfferExtensionInstallOptions {
  editorId: EditorId;
  editorLabel: string;
  extensionId: string;
  extensionLabel: string;
  manualUrl: string;
  /** Extra lines printed after a successful install (e.g. manual config steps). */
  afterInstallSteps?: string[];
}

/**
 * Shared "detect → ask → install via editor CLI" flow used for Continue.dev
 * and Kilo Code. Keeps the PATH-missing messaging consistent across both.
 */
export async function offerExtensionInstall(
  options: OfferExtensionInstallOptions
): Promise<OfferExtensionInstallResult> {
  const { editorId, editorLabel, extensionId, extensionLabel, manualUrl, afterInstallSteps } =
    options;

  const alreadyInstalled = await isExtensionInstalledViaCli(editorId, extensionId);
  if (alreadyInstalled === true) {
    return "already-installed";
  }

  const cliAvailable = await isEditorCliAvailable(editorId);
  const cliBin = editorCliBinary(editorId);

  if (!cliAvailable) {
    const cliHint = cliBin
      ? ` RigUp AI looked for \`${cliBin}\` to install it automatically, but it isn't on PATH — run "Shell Command: Install '${cliBin}' in PATH" from ${editorLabel}'s command palette, then re-run \`rigup init\`.`
      : "";
    warnNote(
      `${extensionLabel} isn't installed yet.${cliHint} Install manually anytime: ${manualUrl}`
    );
    return "cli-unavailable";
  }

  const shouldInstall = await confirmInstallExtension(editorLabel, extensionLabel);
  if (!shouldInstall) {
    warnNote(`Skipped. Install ${extensionLabel} manually anytime: ${manualUrl}`);
    return "declined";
  }

  stepNote("📥", `Installing ${extensionLabel} via ${pc.cyan(`${cliBin} --install-extension`)}...`);
  const installed = await installExtensionViaCli(editorId, extensionId);

  if (!installed) {
    warnNote(
      `Couldn't install ${extensionLabel} automatically via ${cliBin}. Install manually: ${manualUrl}`
    );
    return "failed";
  }

  successNote(
    `${extensionLabel} installed! Restart or reload ${editorLabel} to activate it${
      afterInstallSteps?.length ? ", then:" : "."
    }`
  );
  afterInstallSteps?.forEach((step, i) => console.log(pc.gray(`   ${i + 1}. ${step}`)));
  return "installed";
}
