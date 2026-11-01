export type AgentExtensionStatus = "active" | "discontinued";

export interface AgentExtensionCandidate {
  /** Lowercased publisher.extension-name — the folder segment under globalStorage. */
  id: string;
  label: string;
  status: AgentExtensionStatus;
  note?: string;
}

/**
 * Known agentic coding extensions in the Roo Code lineage, checked in this
 * order (active projects first). This list exists because hardcoding a
 * single "the" extension ID is fragile in a fast-moving ecosystem — Roo
 * Code itself was archived and discontinued on May 15, 2026 (team pivoted
 * to a cloud product, "Roomote"), a few months before this tool was built.
 * Its VS Marketplace ID is confirmed correct below for anyone with it still
 * installed, but Kilo Code — a fork of Roo Code — is the actively
 * maintained successor most new users will actually have.
 *
 * Update this list, don't just edit one string, if the ecosystem shifts
 * again.
 */
export const KNOWN_AGENT_EXTENSIONS: AgentExtensionCandidate[] = [
  { id: "kilocode.kilo-code", label: "Kilo Code", status: "active" },
  { id: "saoudrizwan.claude-dev", label: "Cline", status: "active" },
  {
    id: "rooveterinaryinc.roo-cline",
    label: "Roo Code",
    status: "discontinued",
    note: "Roo Code was archived and discontinued on May 15, 2026 — the team's successor project is Kilo Code.",
  },
];

export function findAgentExtensionCandidate(id: string): AgentExtensionCandidate | undefined {
  return KNOWN_AGENT_EXTENSIONS.find((c) => c.id === id.toLowerCase());
}
