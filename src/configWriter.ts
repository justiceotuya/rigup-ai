import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument, isMap, isSeq, Document } from "yaml";
import type { YAMLSeq, YAMLMap } from "yaml";

export interface ContinueModels {
  chatAgent: string;
  autocomplete: string;
}

export interface ContinueConfigResult {
  path: string;
  created: boolean;
}

const DEFAULT_API_BASE = "http://localhost:11434";
const CHAT_ENTRY_NAME = "LocalStack — Chat/Agent (Ollama)";
const AUTOCOMPLETE_ENTRY_NAME = "LocalStack — Autocomplete (Ollama)";

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds or updates a single model entry in the `models` array, matched by
 * its `name` field. Using a fixed, distinctive name (rather than matching
 * on provider+model) means re-running this after `switch` finds and
 * updates the same entry instead of accumulating duplicates, while never
 * touching any model entry the user added themselves under a different name.
 */
function upsertModelEntry(doc: Document, name: string, modelId: string, roles: string[]): void {
  let modelsNode = doc.get("models", true);

  if (!modelsNode || !isSeq(modelsNode)) {
    modelsNode = doc.createNode([]);
    doc.set("models", modelsNode);
  }

  const seq = modelsNode as YAMLSeq;
  // Force block style regardless of how the seq originated — an empty
  // `models: []` in a hand-written or freshly-bootstrapped file parses as
  // flow-style, and appended items silently inherit that, producing
  // unreadable inline-JSON-ish YAML instead of a normal block list.
  seq.flow = false;


  const items = seq.items as YAMLMap[];
  const existingIndex = items.findIndex((item) => isMap(item) && item.get("name") === name);

  const entry = doc.createNode({
    name,
    provider: "ollama",
    model: modelId,
    apiBase: DEFAULT_API_BASE,
    roles,
  });
  if (isMap(entry)) entry.flow = false;


  if (existingIndex >= 0) {
    seq.set(existingIndex, entry);
  } else {
    seq.add(entry);
  }
}

/**
 * Patches (or creates) Continue.dev's config.yaml with LocalStack's model
 * assignments, without disturbing anything else the user has configured.
 *
 * Deliberately never edits the legacy config.json even if that's all that
 * exists: Continue.dev loads config.yaml over config.json whenever both are
 * present, so creating a fresh config.yaml alongside an existing
 * config.json is additive (the user's old file is untouched and Continue
 * simply prefers the new one) rather than risking a fight with whatever
 * auto-migration Continue does on its own.
 */
export async function patchContinueConfig(
  configDir: string,
  models: ContinueModels
): Promise<ContinueConfigResult> {
  const yamlPath = path.join(configDir, "config.yaml");
  const yamlExists = await fileExists(yamlPath);

  await fs.mkdir(configDir, { recursive: true });

  let doc: Document;
  const created = !yamlExists;

  if (yamlExists) {
    const raw = await fs.readFile(yamlPath, "utf-8");
    doc = parseDocument(raw);
  } else {
    doc = parseDocument("name: LocalStack\nversion: 1.0.0\nschema: v1\nmodels: []\n");
  }

  upsertModelEntry(doc, CHAT_ENTRY_NAME, models.chatAgent, ["chat", "edit", "apply"]);
  upsertModelEntry(doc, AUTOCOMPLETE_ENTRY_NAME, models.autocomplete, ["autocomplete"]);

  await fs.writeFile(yamlPath, doc.toString(), "utf-8");

  return { path: yamlPath, created };
}
