import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmInstallExtensionMock = vi.fn();
const stepNoteMock = vi.fn();
const successNoteMock = vi.fn();
const warnNoteMock = vi.fn();
const isExtensionInstalledViaCliMock = vi.fn();
const isEditorCliAvailableMock = vi.fn();
const installExtensionViaCliMock = vi.fn();
const editorCliBinaryMock = vi.fn();

vi.mock("../prompts.js", () => ({
  confirmInstallExtension: confirmInstallExtensionMock,
  stepNote: stepNoteMock,
  successNote: successNoteMock,
  warnNote: warnNoteMock,
}));

vi.mock("../editorCli.js", () => ({
  isExtensionInstalledViaCli: isExtensionInstalledViaCliMock,
  isEditorCliAvailable: isEditorCliAvailableMock,
  installExtensionViaCli: installExtensionViaCliMock,
  editorCliBinary: editorCliBinaryMock,
}));

const { offerExtensionInstall } = await import("../offerExtensionInstall.js");

beforeEach(() => {
  confirmInstallExtensionMock.mockReset();
  stepNoteMock.mockReset();
  successNoteMock.mockReset();
  warnNoteMock.mockReset();
  isExtensionInstalledViaCliMock.mockReset();
  isEditorCliAvailableMock.mockReset();
  installExtensionViaCliMock.mockReset();
  editorCliBinaryMock.mockReset();
  editorCliBinaryMock.mockReturnValue("cursor");
});

describe("offerExtensionInstall", () => {
  const base = {
    editorId: "cursor" as const,
    editorLabel: "Cursor",
    extensionId: "Continue.continue",
    extensionLabel: "Continue.dev",
    manualUrl: "https://continue.dev",
  };

  it("skips prompting when the extension is already installed", async () => {
    isExtensionInstalledViaCliMock.mockResolvedValueOnce(true);

    await expect(offerExtensionInstall(base)).resolves.toBe("already-installed");
    expect(confirmInstallExtensionMock).not.toHaveBeenCalled();
    expect(installExtensionViaCliMock).not.toHaveBeenCalled();
  });

  it("asks, then installs Continue.dev via the editor CLI", async () => {
    isExtensionInstalledViaCliMock.mockResolvedValueOnce(false);
    isEditorCliAvailableMock.mockResolvedValueOnce(true);
    confirmInstallExtensionMock.mockResolvedValueOnce(true);
    installExtensionViaCliMock.mockResolvedValueOnce(true);

    await expect(
      offerExtensionInstall({
        ...base,
        afterInstallSteps: ["Open the Continue panel"],
      })
    ).resolves.toBe("installed");

    expect(confirmInstallExtensionMock).toHaveBeenCalledWith("Cursor", "Continue.dev");
    expect(installExtensionViaCliMock).toHaveBeenCalledWith("cursor", "Continue.continue");
    expect(successNoteMock).toHaveBeenCalled();
  });

  it("warns with the PATH hint when the editor CLI is missing", async () => {
    isExtensionInstalledViaCliMock.mockResolvedValueOnce(false);
    isEditorCliAvailableMock.mockResolvedValueOnce(false);

    await expect(offerExtensionInstall(base)).resolves.toBe("cli-unavailable");
    expect(warnNoteMock).toHaveBeenCalledWith(expect.stringMatching(/Shell Command: Install 'cursor' in PATH/));
    expect(confirmInstallExtensionMock).not.toHaveBeenCalled();
  });

  it("returns declined when the user says no", async () => {
    isExtensionInstalledViaCliMock.mockResolvedValueOnce(false);
    isEditorCliAvailableMock.mockResolvedValueOnce(true);
    confirmInstallExtensionMock.mockResolvedValueOnce(false);

    await expect(offerExtensionInstall(base)).resolves.toBe("declined");
    expect(installExtensionViaCliMock).not.toHaveBeenCalled();
  });
});
