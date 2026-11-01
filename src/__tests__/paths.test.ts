import { describe, it, expect, vi, afterEach } from "vitest";
import path from "node:path";

async function loadPathsWithPlatform(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = {}
) {
  vi.resetModules();
  vi.doMock("node:os", async () => {
    const actual = await vi.importActual<typeof import("node:os")>("node:os");
    return {
      ...actual,
      default: { ...actual, platform: () => platform, homedir: () => "/home/testuser" },
      platform: () => platform,
      homedir: () => "/home/testuser",
    };
  });

  const originalEnv = { ...process.env };
  Object.assign(process.env, env);

  const mod = await import("../paths.js");

  process.env = originalEnv;
  return mod;
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.resetModules();
});

describe("continueConfigPath", () => {
  it("uses the same ~/.continue/config.yaml shape on every platform (editor-independent)", async () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      const { continueConfigPath } = await loadPathsWithPlatform(platform);
      expect(continueConfigPath()).toContain(".continue");
      expect(continueConfigPath()).toContain("config.yaml");
    }
  });

  it("continueLegacyJsonConfigPath points at the deprecated config.json for existence checks", async () => {
    const { continueLegacyJsonConfigPath } = await loadPathsWithPlatform("linux");
    expect(continueLegacyJsonConfigPath()).toContain("config.json");
  });
});

describe("globalStorageDir — editor-agnostic resolution", () => {
  it("resolves under Cursor's own app folder on Windows, not VS Code's", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("win32", {
      APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
    });
    const cursorPath = globalStorageDir("cursor");
    expect(cursorPath).toContain("Cursor");
    expect(cursorPath).not.toContain(`${path.sep}Code${path.sep}`);
  });

  it("resolves under VS Code's app folder on Windows when editor is vscode", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("win32", {
      APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
    });
    expect(globalStorageDir("vscode")).toContain("Code");
  });

  it("resolves under Cursor's Application Support folder on macOS", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("darwin");
    const result = globalStorageDir("cursor");
    expect(result).toContain("Library");
    expect(result).toContain("Application Support");
    expect(result).toContain("Cursor");
  });

  it("resolves under Windsurf's .config folder on Linux", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("linux");
    const result = globalStorageDir("windsurf");
    expect(result).toContain(".config");
    expect(result).toContain("Windsurf");
  });

  it("uses the user-supplied folder name for a custom/unlisted editor", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("linux");
    const result = globalStorageDir("custom", "Zed");
    expect(result).toContain("Zed");
  });

  it("throws a clear error if 'custom' is chosen without a folder name", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("linux");
    expect(() => globalStorageDir("custom")).toThrow(/customAppDirName/);
  });

  it("falls back to homedir/AppData/Roaming on Windows if APPDATA is unset", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("win32", { APPDATA: undefined });
    expect(globalStorageDir("vscode")).toContain("AppData");
  });

  it("ends in a plain 'globalStorage' segment, since discovery scans that directory", async () => {
    const { globalStorageDir } = await loadPathsWithPlatform("linux");
    expect(globalStorageDir("vscode").endsWith(`${path.sep}globalStorage`)).toBe(true);
  });
});

describe("aiderConfigPath", () => {
  it("uses the same ~/.aider.conf.yml shape on every platform", async () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      const { aiderConfigPath } = await loadPathsWithPlatform(platform);
      expect(aiderConfigPath()).toContain(".aider.conf.yml");
    }
  });
});
