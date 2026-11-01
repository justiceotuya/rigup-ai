import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { selectModelChoice, selectEditor } = await import("../prompts.js");

beforeEach(() => {
  selectMock.mockReset();
  textMock.mockReset();
  isCancelMock.mockReset();
  isCancelMock.mockReturnValue(false);
});

describe("selectModelChoice — back navigation", () => {
  it("re-shows the top-level menu when 'family' leads to picking '⬅ Go back'", async () => {
    selectMock
      .mockResolvedValueOnce("family") // top menu: pick "family"
      .mockResolvedValueOnce("__back__") // family picker: pick "back"
      .mockResolvedValueOnce("recommended"); // top menu again: pick "recommended" this time

    const result = await selectModelChoice("16gb", "qwen2.5-coder:7b", "qwen2.5-coder:1.5b");

    expect(result).toEqual({ type: "recommended" });
    expect(selectMock).toHaveBeenCalledTimes(3); // top menu shown twice + family picker once
  });

  it("actually returns the chosen family when back is NOT picked", async () => {
    selectMock.mockResolvedValueOnce("family").mockResolvedValueOnce("starcoder2");

    const result = await selectModelChoice("16gb", "qwen2.5-coder:7b", "qwen2.5-coder:1.5b");
    expect(result).toEqual({ type: "family", familyId: "starcoder2" });
  });

  it("cancelling (Esc) a custom-tag text prompt returns to the top-level menu, not a full abort", async () => {
    selectMock
      .mockResolvedValueOnce("custom") // top menu: pick "custom"
      .mockResolvedValueOnce("recommended"); // top menu again: pick "recommended"

    textMock.mockResolvedValueOnce(Symbol("cancel")); // cancel the chat-tag text prompt
    isCancelMock
      .mockReturnValueOnce(false) // top-level select choice ("custom") is not a cancel
      .mockReturnValueOnce(true); // the text prompt result IS a cancel

    const result = await selectModelChoice("16gb", "qwen2.5-coder:7b", "qwen2.5-coder:1.5b");

    expect(result).toEqual({ type: "recommended" });
    expect(selectMock).toHaveBeenCalledTimes(2); // top menu shown twice
    expect(textMock).toHaveBeenCalledTimes(1); // only got as far as the first text field
  });

  it("completes the custom flow normally when neither text prompt is cancelled", async () => {
    selectMock.mockResolvedValueOnce("custom");
    textMock.mockResolvedValueOnce("my-model:7b").mockResolvedValueOnce("my-model:1b");
    isCancelMock.mockReturnValue(false);

    const result = await selectModelChoice("16gb", "qwen2.5-coder:7b", "qwen2.5-coder:1.5b");
    expect(result).toEqual({ type: "custom", chatAgent: "my-model:7b", autocomplete: "my-model:1b" });
  });

  it("returns 'changeEditor' immediately without looping internally — that link belongs to the caller", async () => {
    selectMock.mockResolvedValueOnce("changeEditor");

    const result = await selectModelChoice("16gb", "qwen2.5-coder:7b", "qwen2.5-coder:1.5b");

    expect(result).toEqual({ type: "changeEditor" });
    expect(selectMock).toHaveBeenCalledTimes(1); // doesn't try to resolve this itself
  });
});

describe("selectEditor — back navigation", () => {
  it("cancelling the custom app-dir-name prompt returns to the editor list, not a full abort", async () => {
    selectMock
      .mockResolvedValueOnce("custom") // pick "Something else"
      .mockResolvedValueOnce("vscode"); // second time through: pick VS Code

    textMock.mockResolvedValueOnce(Symbol("cancel"));
    isCancelMock
      .mockReturnValueOnce(false) // the editor select itself
      .mockReturnValueOnce(true); // the app-dir-name text prompt

    const result = await selectEditor();

    expect(result).toEqual({ id: "vscode" });
    expect(selectMock).toHaveBeenCalledTimes(2); // editor list shown twice
  });
});
