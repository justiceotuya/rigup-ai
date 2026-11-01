import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLI_COMMANDS } from "../cliCommands.js";

const selectMock = vi.fn();
const textMock = vi.fn();
const isCancelMock = vi.fn();

vi.mock("@clack/prompts", () => ({
  select: selectMock,
  text: textMock,
  isCancel: isCancelMock,
  confirm: vi.fn(),
  multiselect: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { step: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

const { selectCliCommand, promptSwitchArgs, promptGuardAction } = await import(
  "../prompts.js"
);

beforeEach(() => {
  selectMock.mockReset();
  textMock.mockReset();
  isCancelMock.mockReset();
  isCancelMock.mockReturnValue(false);
});

describe("selectCliCommand", () => {
  it("lists every CLI command with its description as a hint", async () => {
    selectMock.mockResolvedValueOnce("doctor");

    await expect(selectCliCommand()).resolves.toBe("doctor");

    const opts = selectMock.mock.calls[0]?.[0] as {
      options: Array<{ value: string; label: string; hint: string }>;
    };
    expect(opts.options.map((o) => o.value)).toEqual(CLI_COMMANDS.map((c) => c.name));
    expect(opts.options.map((o) => o.hint)).toEqual(CLI_COMMANDS.map((c) => c.description));
  });

  it("returns null on cancel instead of throwing", async () => {
    const cancelSymbol = Symbol("cancel");
    selectMock.mockResolvedValueOnce(cancelSymbol);
    isCancelMock.mockReturnValueOnce(true);

    await expect(selectCliCommand()).resolves.toBeNull();
  });
});

describe("promptSwitchArgs", () => {
  it("collects role + size for interactive switch", async () => {
    selectMock.mockResolvedValueOnce("chat");
    textMock.mockResolvedValueOnce("7b");

    await expect(promptSwitchArgs()).resolves.toEqual({ role: "chat", size: "7b" });
  });

  it("returns null when role selection is cancelled", async () => {
    selectMock.mockResolvedValueOnce(Symbol("cancel"));
    isCancelMock.mockReturnValueOnce(true);

    await expect(promptSwitchArgs()).resolves.toBeNull();
  });
});

describe("promptGuardAction", () => {
  it("returns start or stop", async () => {
    selectMock.mockResolvedValueOnce("stop");
    await expect(promptGuardAction()).resolves.toBe("stop");
  });
});
