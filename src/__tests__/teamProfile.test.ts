import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { findTeamProfile } from "../teamProfile.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rigup-teamprofile-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("findTeamProfile", () => {
  it("returns null when no rigup.yaml exists anywhere up to the filesystem root", async () => {
    const nested = path.join(tmpDir, "a", "b", "c");
    await fs.mkdir(nested, { recursive: true });
    const result = await findTeamProfile(nested);
    expect(result).toBeNull();
  });

  it("finds a rigup.yaml in the starting directory itself", async () => {
    await fs.writeFile(
      path.join(tmpDir, "rigup.yaml"),
      "version: 1\nmodelFamily: starcoder2\n"
    );
    const result = await findTeamProfile(tmpDir);
    expect(result?.profile.modelFamily).toBe("starcoder2");
  });

  it("finds a rigup.yaml at the repo root from a nested subdirectory", async () => {
    await fs.writeFile(
      path.join(tmpDir, "rigup.yaml"),
      "version: 1\nmodelFamily: codegemma\n"
    );
    await fs.mkdir(path.join(tmpDir, ".git")); // mark as repo root
    const nested = path.join(tmpDir, "packages", "app", "src");
    await fs.mkdir(nested, { recursive: true });

    const result = await findTeamProfile(nested);
    expect(result?.profile.modelFamily).toBe("codegemma");
    expect(result?.path).toBe(path.join(tmpDir, "rigup.yaml"));
  });

  it("stops searching at a .git boundary and does not look further up", async () => {
    // A rigup.yaml ABOVE the repo root should NOT be found — the repo
    // boundary is a hard stop, otherwise an unrelated parent folder's file
    // could leak into a repo that has no config of its own.
    await fs.writeFile(
      path.join(tmpDir, "rigup.yaml"),
      "version: 1\nmodelFamily: codegemma\n"
    );
    const repoDir = path.join(tmpDir, "myrepo");
    await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
    const nested = path.join(repoDir, "src");
    await fs.mkdir(nested, { recursive: true });

    const result = await findTeamProfile(nested);
    expect(result).toBeNull();
  });

  it("parses per-tier overrides correctly", async () => {
    await fs.writeFile(
      path.join(tmpDir, "rigup.yaml"),
      [
        "version: 1",
        "modelFamily: qwen2.5-coder",
        "tiers:",
        "  16gb:",
        "    chat: qwen2.5-coder:32b",
        "",
      ].join("\n")
    );
    const result = await findTeamProfile(tmpDir);
    expect(result?.profile.tiers?.["16gb"]?.chat).toBe("qwen2.5-coder:32b");
  });

  it("rejects a malformed profile (schema validation actually runs)", async () => {
    await fs.writeFile(path.join(tmpDir, "rigup.yaml"), "version: not-a-number\n");
    await expect(findTeamProfile(tmpDir)).rejects.toThrow();
  });
});
