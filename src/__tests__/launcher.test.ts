import { beforeEach, describe, expect, it, vi } from "vitest";

const selectCliCommandMock = vi.fn();
const promptSwitchArgsMock = vi.fn();
const promptGuardActionMock = vi.fn();
const runInitMock = vi.fn();
const runDoctorMock = vi.fn();
const runSwitchMock = vi.fn();
const runGuardMock = vi.fn();
const runAiderMock = vi.fn();
const runUninstallMock = vi.fn();
const cancelMock = vi.fn();

vi.mock("../prompts.js", () => ({
  selectCliCommand: selectCliCommandMock,
  promptSwitchArgs: promptSwitchArgsMock,
  promptGuardAction: promptGuardActionMock,
}));

vi.mock("../commands/init.js", () => ({ runInit: runInitMock }));
vi.mock("../commands/doctor.js", () => ({ runDoctor: runDoctorMock }));
vi.mock("../commands/switch.js", () => ({ runSwitch: runSwitchMock }));
vi.mock("../commands/guard.js", () => ({ runGuard: runGuardMock }));
vi.mock("../commands/aider.js", () => ({ runAider: runAiderMock }));
vi.mock("../commands/uninstall.js", () => ({ runUninstall: runUninstallMock }));

vi.mock("@clack/prompts", () => ({
  cancel: cancelMock,
}));

const { runInteractiveLauncher } = await import("../launcher.js");

beforeEach(() => {
  selectCliCommandMock.mockReset();
  promptSwitchArgsMock.mockReset();
  promptGuardActionMock.mockReset();
  runInitMock.mockReset();
  runDoctorMock.mockReset();
  runSwitchMock.mockReset();
  runGuardMock.mockReset();
  runAiderMock.mockReset();
  runUninstallMock.mockReset();
  cancelMock.mockReset();
});

describe("runInteractiveLauncher", () => {
  it("exits cleanly without erroring when the user cancels command selection", async () => {
    selectCliCommandMock.mockResolvedValueOnce(null);

    await runInteractiveLauncher();

    expect(cancelMock).toHaveBeenCalled();
    expect(runInitMock).not.toHaveBeenCalled();
    expect(runDoctorMock).not.toHaveBeenCalled();
  });

  it("dispatches to doctor when selected", async () => {
    selectCliCommandMock.mockResolvedValueOnce("doctor");

    await runInteractiveLauncher();

    expect(runDoctorMock).toHaveBeenCalledTimes(1);
  });

  it("prompts for switch args then runs switch", async () => {
    selectCliCommandMock.mockResolvedValueOnce("switch");
    promptSwitchArgsMock.mockResolvedValueOnce({ role: "chat", size: "7b" });

    await runInteractiveLauncher();

    expect(runSwitchMock).toHaveBeenCalledWith("chat", "7b");
  });

  it("prompts for guard action then runs guard", async () => {
    selectCliCommandMock.mockResolvedValueOnce("guard");
    promptGuardActionMock.mockResolvedValueOnce("start");

    await runInteractiveLauncher();

    expect(runGuardMock).toHaveBeenCalledWith("start");
  });
});
