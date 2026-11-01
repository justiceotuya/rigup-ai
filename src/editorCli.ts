import { execa } from "execa";
import type { EditorId } from "./editors.js";

/**
 * The CLI binary each VS Code-family editor exposes, if the person has run
 * "Shell Command: Install '<editor>' in PATH" from that editor's command
 * palette (a one-time, per-editor, opt-in step — not something RigUp AI
 * can trigger itself). Verified for Cursor specifically: `cursor
 * --install-extension <id>` is a real, documented command, not guessed —
 * Cursor is a VS Code fork and mirrors VS Code's CLI interface for this.
 * `custom` editors have no known binary, since RigUp AI doesn't know
 * what they are.
 */
const EDITOR_CLI_BIN: Partial<Record<EditorId, string>> = {
  vscode: "code",
  cursor: "cursor",
  windsurf: "windsurf",
  vscodium: "codium",
};

export function editorCliBinary(editorId: EditorId): string | null {
  return EDITOR_CLI_BIN[editorId] ?? null;
}

export async function isEditorCliAvailable(editorId: EditorId): Promise<boolean> {
  const bin = editorCliBinary(editorId);
  if (!bin) return false;
  try {
    await execa(bin, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs an extension via the editor's own CLI. Unlike the Ollama
 * installer, there's nothing here to progress-bar — `--install-extension`
 * is a short marketplace-download-and-register operation, not a
 * multi-gigabyte pull, so its own (usually brief) output is simply
 * inherited rather than wrapped in custom UI.
 */
export async function installExtensionViaCli(
  editorId: EditorId,
  extensionId: string
): Promise<boolean> {
  const bin = editorCliBinary(editorId);
  if (!bin) return false;
  try {
    await execa(bin, ["--install-extension", extensionId], { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Uses the editor CLI's `--list-extensions` (same stable contract as
 * `--install-extension`) so we can skip offering an install the user
 * already has. Returns null when the CLI isn't available or the list
 * command fails — callers treat that as "unknown, may still offer install".
 */
export async function isExtensionInstalledViaCli(
  editorId: EditorId,
  extensionId: string
): Promise<boolean | null> {
  const bin = editorCliBinary(editorId);
  if (!bin) return null;
  try {
    const { stdout } = await execa(bin, ["--list-extensions"]);
    const installed = new Set(
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean)
    );
    return installed.has(extensionId.toLowerCase());
  } catch {
    return null;
  }
}
