import { describe, it, expect, vi } from "vitest";

const confirmMock = vi.fn();
const isCancelMock = vi.fn(() => false);

vi.mock("@clack/prompts", () => ({
  confirm: confirmMock,
  isCancel: isCancelMock,
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  multiselect: vi.fn(),
  log: { step: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

const { confirmContinueSetup } = await import("../prompts.js");

describe("confirmContinueSetup", () => {
  it("returns true when the person confirms", async () => {
    confirmMock.mockResolvedValueOnce(true);
    isCancelMock.mockReturnValueOnce(false);
    expect(await confirmContinueSetup()).toBe(true);
  });

  it("returns false when the person declines", async () => {
    confirmMock.mockResolvedValueOnce(false);
    isCancelMock.mockReturnValueOnce(false);
    expect(await confirmContinueSetup()).toBe(false);
  });

  it("treats Ctrl+C (cancel) the same as declining, not as an error", async () => {
    confirmMock.mockResolvedValueOnce(Symbol("cancel"));
    isCancelMock.mockReturnValueOnce(true);
    expect(await confirmContinueSetup()).toBe(false);
  });
});
