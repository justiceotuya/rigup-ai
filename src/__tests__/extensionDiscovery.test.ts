import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverAgentExtensions } from "../extensionDiscovery.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rigup-discovery-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("discoverAgentExtensions", () => {
  it("returns an empty array if globalStorage doesn't exist yet", async () => {
    const result = await discoverAgentExtensions(path.join(tmpDir, "does-not-exist"));
    expect(result).toEqual([]);
  });

  it("returns an empty array if globalStorage exists but has no known extensions", async () => {
    await fs.mkdir(path.join(tmpDir, "some.other-extension"));
    const result = await discoverAgentExtensions(tmpDir);
    expect(result).toEqual([]);
  });

  it("finds Kilo Code when its folder is present", async () => {
    await fs.mkdir(path.join(tmpDir, "kilocode.kilo-code"));
    const result = await discoverAgentExtensions(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.candidate.label).toBe("Kilo Code");
    expect(result[0]?.candidate.status).toBe("active");
  });

  it("finds Roo Code and flags it as discontinued", async () => {
    await fs.mkdir(path.join(tmpDir, "rooveterinaryinc.roo-cline"));
    const result = await discoverAgentExtensions(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.candidate.label).toBe("Roo Code");
    expect(result[0]?.candidate.status).toBe("discontinued");
    expect(result[0]?.candidate.note).toMatch(/discontinued/i);
  });

  it("matches folder names case-insensitively", async () => {
    await fs.mkdir(path.join(tmpDir, "KiloCode.Kilo-Code"));
    const result = await discoverAgentExtensions(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.candidate.id).toBe("kilocode.kilo-code");
  });

  it("finds multiple installed extensions and orders them active-first", async () => {
    await fs.mkdir(path.join(tmpDir, "rooveterinaryinc.roo-cline"));
    await fs.mkdir(path.join(tmpDir, "kilocode.kilo-code"));
    const result = await discoverAgentExtensions(tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0]?.candidate.label).toBe("Kilo Code"); // active, listed first
    expect(result[1]?.candidate.label).toBe("Roo Code");
  });
});
