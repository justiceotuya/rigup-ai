/**
 * Every supported editor is a VS Code-family app (VS Code itself or a fork),
 * which means they all follow the same globalStorage layout — they just use
 * a different app folder name. Adding a new editor is just adding an entry
 * here; nothing else in the codebase needs to change.
 */
export type EditorId = "vscode" | "cursor" | "windsurf" | "vscodium" | "custom";

export interface EditorDefinition {
  id: EditorId;
  label: string;
  emoji: string;
  /** The folder name VS Code-family apps use under the OS's app-data root. */
  appDirName: string | null; // null for "custom" — the user supplies their own
}

export const EDITORS: EditorDefinition[] = [
  { id: "vscode", label: "VS Code", emoji: "💙", appDirName: "Code" },
  { id: "cursor", label: "Cursor", emoji: "🌟", appDirName: "Cursor" },
  { id: "windsurf", label: "Windsurf", emoji: "🏄", appDirName: "Windsurf" },
  { id: "vscodium", label: "VSCodium", emoji: "🔷", appDirName: "VSCodium" },
  { id: "custom", label: "Something else", emoji: "🎛️", appDirName: null },
];

export function editorById(id: EditorId): EditorDefinition {
  const found = EDITORS.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown editor id: ${id}`);
  return found;
}
