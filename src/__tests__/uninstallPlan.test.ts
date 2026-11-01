import { describe, it, expect } from "vitest";
import { ollamaUninstallSteps, requiresElevation } from "../uninstallPlan.js";

describe("ollamaUninstallSteps", () => {
  it("macOS: quits the app, removes the bundle, removes the CLI symlink", () => {
    const steps = ollamaUninstallSteps("darwin");
    const allCommands = steps.flatMap((s) => s.commands).join(" ");
    expect(allCommands).toContain("/Applications/Ollama.app");
    expect(allCommands).toContain("/usr/local/bin/ollama");
    expect(allCommands).toContain("pkill");
  });

  it("Linux: stops the systemd service before removing files", () => {
    const steps = ollamaUninstallSteps("linux");
    const labels = steps.map((s) => s.label);
    const stopIndex = labels.findIndex((l) => l.toLowerCase().includes("stop"));
    const removeBinaryIndex = labels.findIndex((l) => l.toLowerCase().includes("binary"));
    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(removeBinaryIndex).toBeGreaterThan(stopIndex); // service stopped before binary is pulled out from under it
  });

  it("Linux: removes the systemd service file and reloads the daemon", () => {
    const steps = ollamaUninstallSteps("linux");
    const allCommands = steps.flatMap((s) => s.commands).join(" ");
    expect(allCommands).toContain("/etc/systemd/system/ollama.service");
    expect(allCommands).toContain("daemon-reload");
  });

  it("Windows: never invokes sudo/systemctl — hands off to the OS's own uninstaller UI instead", () => {
    const steps = ollamaUninstallSteps("win32");
    const allCommands = steps.flatMap((s) => s.commands).join(" ");
    expect(allCommands).not.toContain("sudo");
    expect(allCommands).not.toContain("systemctl");
    expect(allCommands).toContain("ms-settings:appsfeatures");
  });

  it("macOS and Linux steps use sudo; Windows steps never do", () => {
    for (const platform of ["darwin", "linux"] as const) {
      const allCommands = ollamaUninstallSteps(platform).flatMap((s) => s.commands).join(" ");
      expect(allCommands).toContain("sudo");
    }
    const winCommands = ollamaUninstallSteps("win32").flatMap((s) => s.commands).join(" ");
    expect(winCommands).not.toContain("sudo");
  });
});

describe("requiresElevation", () => {
  it("is true for macOS and Linux", () => {
    expect(requiresElevation("darwin")).toBe(true);
    expect(requiresElevation("linux")).toBe(true);
  });

  it("is false for Windows (no auto-elevation attempted)", () => {
    expect(requiresElevation("win32")).toBe(false);
  });
});
