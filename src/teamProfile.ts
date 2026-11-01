import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";

const TierOverrideSchema = z.object({
  chat: z.string().optional(),
  autocomplete: z.string().optional(),
});

const TeamProfileSchema = z.object({
  version: z.number(),
  modelFamily: z.string().optional(),
  tiers: z
    .object({
      insufficient: TierOverrideSchema.optional(),
      "8gb": TierOverrideSchema.optional(),
      "16gb": TierOverrideSchema.optional(),
    })
    .optional(),
});

export type TeamProfile = z.infer<typeof TeamProfileSchema>;

export const TEAM_PROFILE_FILENAME = "rigup.yaml";

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Searches from startDir upward for a rigup.yaml, so a team can commit
 * one at the repo root and everyone gets the same model choices without
 * hand-editing anything. Stops (inclusive) at the first .git directory
 * found, so it doesn't wander past a repo boundary into unrelated parent
 * folders on someone's machine — and stops at the filesystem root as a
 * hard backstop either way.
 */
export async function findTeamProfile(
  startDir: string
): Promise<{ profile: TeamProfile; path: string } | null> {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, TEAM_PROFILE_FILENAME);
    if (await exists(candidate)) {
      const raw = await fs.readFile(candidate, "utf-8");
      const parsed = TeamProfileSchema.parse(parseDocument(raw).toJSON());
      return { profile: parsed, path: candidate };
    }

    const isRepoRoot = await exists(path.join(dir, ".git"));
    if (isRepoRoot || dir === root) break;
    dir = path.dirname(dir);
  }

  return null;
}
