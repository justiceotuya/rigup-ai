import { z } from "zod";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const StateSchema = z.object({
  ramGb: z.number(),
  os: z.string(),
  tier: z.enum(["insufficient", "8gb", "16gb"]),
  editor: z.object({
    id: z.enum(["vscode", "cursor", "windsurf", "vscodium", "custom"]),
    customAppDirName: z.string().optional(),
  }),
  models: z.object({
    chatAgent: z.string(),
    autocomplete: z.string(),
  }),
  modelFamily: z.string().default("qwen2.5-coder"),
  integrations: z.object({
    continue: z.object({ configured: z.boolean(), path: z.string().optional() }),
    agentExtension: z.object({
      id: z.string().optional(), // e.g. "kilocode.kilo-code" — whichever was actually found
      label: z.string().optional(), // e.g. "Kilo Code"
      configured: z.boolean(),
      path: z.string().optional(),
    }),
    aider: z.object({ configured: z.boolean() }),
  }),
  lastHealthCheck: z.string().nullable(),
});

export type State = z.infer<typeof StateSchema>;

export const LOCALSTACK_DIR = path.join(os.homedir(), ".localstack");
export const STATE_PATH = path.join(LOCALSTACK_DIR, "state.json");

export function defaultState(): State {
  return {
    ramGb: 0,
    os: os.platform(),
    tier: "insufficient",
    editor: { id: "vscode" },
    models: { chatAgent: "", autocomplete: "" },
    modelFamily: "qwen2.5-coder",
    integrations: {
      continue: { configured: false },
      agentExtension: { configured: false },
      aider: { configured: false },
    },
    lastHealthCheck: null,
  };
}

/**
 * Reads and validates state.json. Returns null (not an error) if the file
 * doesn't exist yet — that's a normal "not initialized" case, not a failure.
 * Throws if the file exists but fails schema validation, since that means
 * something wrote a corrupt or incompatible manifest and silently proceeding
 * would risk overwriting the user's real config with garbage.
 */
export async function readState(): Promise<State | null> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf-8");
    return StateSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeState(state: State): Promise<void> {
  StateSchema.parse(state); // fail loudly before touching disk
  await fs.mkdir(LOCALSTACK_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
