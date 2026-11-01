import { promises as fs } from "node:fs";
import path from "node:path";
import { KNOWN_AGENT_EXTENSIONS, type AgentExtensionCandidate } from "./agentExtensions.js";

export interface AgentExtensionMatch {
  candidate: AgentExtensionCandidate;
  dir: string;
}

/**
 * Scans an editor's globalStorage directory for any of the known agentic
 * coding extensions, instead of assuming one hardcoded folder is "the"
 * extension. This is the actual fix for the placeholder problem: even if
 * the ecosystem shifts again (as it already did once — see
 * agentExtensions.ts), this only needs a new entry added to the candidate
 * list, not a rewrite of the detection logic.
 *
 * Returns every match found, in KNOWN_AGENT_EXTENSIONS order (active
 * projects checked first). An empty globalStorage directory (or one that
 * doesn't exist yet) is not an error — it just means nothing's installed.
 */
export async function discoverAgentExtensions(
  globalStorageDir: string
): Promise<AgentExtensionMatch[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(globalStorageDir);
  } catch {
    return [];
  }

  const lowerEntries = new Set(entries.map((e) => e.toLowerCase()));
  const matches: AgentExtensionMatch[] = [];

  for (const candidate of KNOWN_AGENT_EXTENSIONS) {
    if (lowerEntries.has(candidate.id)) {
      matches.push({ candidate, dir: path.join(globalStorageDir, candidate.id) });
    }
  }

  return matches;
}
