import { beforeEach, describe, expect, it, vi } from "vitest";

const multiselectMock = vi.fn();
const isCancelMock = vi.fn();

vi.mock("@clack/prompts", () => ({
  multiselect: multiselectMock,
  isCancel: isCancelMock,
  select: vi.fn(),
  confirm: vi.fn(),
  text: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  log: {
    message: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const { selectUninstallTargets } = await import("../prompts.js");

beforeEach(() => {
  multiselectMock.mockReset();
  isCancelMock.mockReset();
  isCancelMock.mockReturnValue(false);
});

describe("selectUninstallTargets", () => {
  it("requires at least one selection so Enter-without-Space cannot silently no-op", async () => {
    multiselectMock.mockResolvedValueOnce(["state"]);

    await selectUninstallTargets();

    expect(multiselectMock).toHaveBeenCalledTimes(1);
    const opts = multiselectMock.mock.calls[0]?.[0] as {
      required?: boolean;
      message?: string;
    };
    // Regression: required:false let users highlight an option, press Enter
    // (like every other menu), get [], and see "Nothing removed".
    expect(opts.required).toBe(true);
    expect(opts.message).toMatch(/Space to select/i);
    expect(opts.message).toMatch(/Enter to confirm/i);
  });

  it("returns the selected targets", async () => {
    multiselectMock.mockResolvedValueOnce(["models", "ollama"]);

    await expect(selectUninstallTargets("qwen2.5-coder:7b")).resolves.toEqual([
      "models",
      "ollama",
    ]);

    const opts = multiselectMock.mock.calls[0]?.[0] as {
      options: Array<{ value: string; label: string }>;
    };
    expect(opts.options.map((o) => o.value)).toEqual(["state", "models", "ollama"]);
    expect(opts.options[1]?.label).toContain("qwen2.5-coder:7b");
  });

  it("returns [] on cancel so uninstall can safely exit", async () => {
    const cancelSymbol = Symbol("cancel");
    multiselectMock.mockResolvedValueOnce(cancelSymbol);
    isCancelMock.mockReturnValueOnce(true);

    await expect(selectUninstallTargets()).resolves.toEqual([]);
  });
});
