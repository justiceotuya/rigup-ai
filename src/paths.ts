import os from "node:os";
import path from "node:path";
import { editorById, type EditorId } from "./editors.js";

/**
 * Centralizes every OS-specific and editor-specific path the CLI needs, so
 * no other module has to special-case `process.platform` or hardcode "Code"
 * itself. Verified against VS Code's and Cursor's documented storage
 * locations (Windows: %APPDATA%\<App>\User; macOS: ~/Library/Application
 * Support/<App>/User; Linux: ~/.config/<App>/User) — Cursor, Windsurf, and
 * VSCodium follow the same layout as VS Code itself, just under their own
 * app folder name.
 */

function editorUserDir(editorId: EditorId, customAppDirName?: string): string {
  const def = editorById(editorId);
  const appDirName = def.appDirName ?? customAppDirName;

  if (!appDirName) {
    throw new Error(
      "No app folder name available for this editor — customAppDirName is required for 'custom'."
    );
  }

  const platform = os.platform();

  if (platform === "win32") {
    // %APPDATA% is always set on Windows, but fall back defensively.
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, appDirName, "User");
  }

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appDirName, "User");
  }

  // Linux and other POSIX platforms.
  return path.join(os.homedir(), ".config", appDirName, "User");
}

/**
 * Continue.dev keeps its config in the user's home directory on every
 * platform and every editor (unlike most extensions, it does not use
 * globalStorage). Confirmed against Continue's own docs: the current
 * primary format is config.yaml (config.json still works but is
 * deprecated — Continue loads config.yaml over it when both exist), at
 * ~/.continue on macOS/Linux and %USERPROFILE%\.continue on Windows.
 */
export function continueConfigDir(): string {
  return path.join(os.homedir(), ".continue");
}

export function continueConfigPath(): string {
  return path.join(continueConfigDir(), "config.yaml");
}

export function continueLegacyJsonConfigPath(): string {
  return path.join(continueConfigDir(), "config.json");
}

/**
 * Roo Code, Kilo Code, Cline, and most other VS Code-family agentic coding
 * extensions all store their data under the editor's globalStorage
 * directory, namespaced by publisher.extension-id. Rather than assuming
 * which one of them is actually installed, this returns the shared parent
 * directory — src/extensionDiscovery.ts scans it against a known-candidate
 * list (see src/agentExtensions.ts) instead of hardcoding a single guess.
 */
export function globalStorageDir(editorId: EditorId, customAppDirName?: string): string {
  return path.join(editorUserDir(editorId, customAppDirName), "globalStorage");
}

/**
 * Aider has no editor integration — it reads a plain YAML config from the
 * home directory, same path regardless of OS or editor.
 */
export function aiderConfigPath(): string {
  return path.join(os.homedir(), ".aider.conf.yml");
}
