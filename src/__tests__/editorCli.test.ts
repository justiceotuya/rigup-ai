import { describe, it, expect, vi, beforeEach } from "vitest";

const execaMock = vi.fn();

vi.mock("execa", () => ({
  execa: execaMock,
}));

const { editorCliBinary, isEditorCliAvailable, installExtensionViaCli } = await import(
  "../editorCli.js"
);

beforeEach(() => {
  execaMock.mockReset();
});

describe("editorCliBinary", () => {
  it("maps each known editor to its real CLI binary name", () => {
    expect(editorCliBinary("vscode")).toBe("code");
    expect(editorCliBinary("cursor")).toBe("cursor");
    expect(editorCliBinary("windsurf")).toBe("windsurf");
    expect(editorCliBinary("vscodium")).toBe("codium");
  });

  it("returns null for 'custom' — there's no known binary for an unlisted editor", () => {
    expect(editorCliBinary("custom")).toBeNull();
  });
});

describe("isEditorCliAvailable", () => {
  it("returns true when the binary responds to --version", async () => {
    execaMock.mockResolvedValueOnce({ stdout: "1.2.3" });
    expect(await isEditorCliAvailable("cursor")).toBe(true);
    expect(execaMock).toHaveBeenCalledWith("cursor", ["--version"]);
  });

  it("returns false when the binary isn't found", async () => {
    execaMock.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await isEditorCliAvailable("cursor")).toBe(false);
  });

  it("returns false immediately for 'custom' without even trying to spawn anything", async () => {
    expect(await isEditorCliAvailable("custom")).toBe(false);
    expect(execaMock).not.toHaveBeenCalled();
  });
});

describe("installExtensionViaCli", () => {
  it("calls '<bin> --install-extension <id>' with inherited stdio", async () => {
    execaMock.mockResolvedValueOnce({});
    const result = await installExtensionViaCli("cursor", "kilocode.kilo-code");

    expect(result).toBe(true);
    expect(execaMock).toHaveBeenCalledWith(
      "cursor",
      ["--install-extension", "kilocode.kilo-code"],
      { stdio: "inherit" }
    );
  });

  it("returns false (not throws) if the install command fails", async () => {
    execaMock.mockRejectedValueOnce(new Error("network error"));
    const result = await installExtensionViaCli("cursor", "kilocode.kilo-code");
    expect(result).toBe(false);
  });

  it("returns false for 'custom' without attempting anything", async () => {
    const result = await installExtensionViaCli("custom", "kilocode.kilo-code");
    expect(result).toBe(false);
    expect(execaMock).not.toHaveBeenCalled();
  });
});
