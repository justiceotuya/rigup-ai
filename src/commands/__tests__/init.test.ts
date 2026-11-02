import { describe, it, expect, vi, beforeEach } from "vitest";

const isOllamaAvailableMock = vi.fn();
const ensureModelMock = vi.fn();
const testGenerateMock = vi.fn();
const patchKiloConfigMock = vi.fn();
const selectEditorMock = vi.fn();
const selectModelChoiceMock = vi.fn();
const findTeamProfileMock = vi.fn();
const resolveModelsMock = vi.fn();
const discoverAgentExtensionsMock = vi.fn();
const offerExtensionInstallMock = vi.fn();
const patchContinueConfigMock = vi.fn();
const writeStateMock = vi.fn();

vi.mock("../../ollama.js", () => ({
  isOllamaAvailable: isOllamaAvailableMock,
  ensureModel: ensureModelMock,
  ensureOllamaServerRunning: vi.fn().mockResolvedValue(true),
  testGenerate: testGenerateMock,
}));

vi.mock("../../kiloConfigWriter.js", () => ({ patchKiloConfig: patchKiloConfigMock }));
const ensureContextVariantMock = vi.fn();
const planForModelMock = vi.fn();
const confirmKiloDespiteLimitsMock = vi.fn();
vi.mock("../../contextVariant.js", () => ({
  planForModel: planForModelMock,
  ensureContextVariant: ensureContextVariantMock,
}));

vi.mock("../../state.js", () => ({
  writeState: writeStateMock,
  defaultState: () => ({
    ramGb: 0,
    os: "linux",
    tier: "insufficient",
    editor: { id: "vscode" },
    models: { chatAgent: "", autocomplete: "" },
    modelFamily: "qwen2.5-coder",
    integrations: {
      continue: { configured: false },
      agentExtension: { configured: false },
      aider: { configured: false },
    },
    lastHealthCheck: null,
  }),
}));

vi.mock("../../detector.js", () => ({
  detectHardware: () => ({ totalRamGb: 16, platform: "linux", tier: "16gb" }),
}));

vi.mock("../../installer.js", () => ({ installOllama: vi.fn() }));

vi.mock("../../prompts.js", () => ({
  introBanner: vi.fn(),
  outroSuccess: vi.fn(),
  outroError: vi.fn(),
  selectEditor: selectEditorMock,
  confirmInstallOllama: vi.fn(),
  confirmContinueSetup: vi.fn(),
  confirmKiloDespiteLimits: confirmKiloDespiteLimitsMock,
  selectModelChoice: selectModelChoiceMock,
  stepNote: vi.fn(),
  warnNote: vi.fn(),
  successNote: vi.fn(),
}));

vi.mock("../../editors.js", () => ({
  editorById: (id: string) => ({ id, label: id, emoji: "💙", appDirName: "Code" }),
}));

vi.mock("../../paths.js", () => ({
  continueConfigDir: () => "/fake/.continue",
  globalStorageDir: () => "/fake/globalStorage",
}));

vi.mock("../../configWriter.js", () => ({ patchContinueConfig: patchContinueConfigMock }));
vi.mock("../../extensionDiscovery.js", () => ({
  discoverAgentExtensions: discoverAgentExtensionsMock,
}));
vi.mock("../../agentExtensionGuide.js", () => ({ agentExtensionSetupSteps: vi.fn(() => []) }));
vi.mock("../../modelResolution.js", () => ({ resolveModels: resolveModelsMock }));
vi.mock("../../teamProfile.js", () => ({ findTeamProfile: findTeamProfileMock }));
vi.mock("../../modelFamilies.js", () => ({
  DEFAULT_MODEL_FAMILY_ID: "qwen2.5-coder",
  getModelFamily: vi.fn(),
}));
vi.mock("../../agentExtensions.js", () => ({
  findAgentExtensionCandidate: vi.fn(() => ({
    id: "kilocode.kilo-code",
    label: "Kilo Code",
    status: "active",
  })),
}));
vi.mock("../../continueExtension.js", () => ({
  CONTINUE_EXTENSION: { id: "Continue.continue", label: "Continue.dev", manualUrl: "https://continue.dev" },
}));
// init.ts talks to offerExtensionInstall() as a single black box now (it
// wraps editorCli.js internally) — so that's the one seam to mock here,
// rather than reaching into editorCli.js's individual functions.
vi.mock("../../offerExtensionInstall.js", () => ({
  offerExtensionInstall: offerExtensionInstallMock,
}));

// Imported after every mock is registered so init.ts picks up the mocked modules.
const { waitForOllama, runInit } = await import("../init.js");

beforeEach(() => {
  isOllamaAvailableMock.mockReset();
  ensureModelMock.mockReset();
  testGenerateMock.mockReset();
  patchKiloConfigMock.mockReset();
  ensureContextVariantMock.mockReset();
  planForModelMock.mockReset();
  planForModelMock.mockResolvedValue({ numCtx: 32768, toolCapable: true, agentReliable: true, warnings: [] });
  confirmKiloDespiteLimitsMock.mockReset();
  ensureContextVariantMock.mockImplementation(async (m: string) => `${m}-rigup-32k`);
  selectEditorMock.mockReset();
  selectModelChoiceMock.mockReset();
  findTeamProfileMock.mockReset();
  resolveModelsMock.mockReset();
  discoverAgentExtensionsMock.mockReset();
  offerExtensionInstallMock.mockReset();
  patchContinueConfigMock.mockReset();
  writeStateMock.mockReset();

  patchKiloConfigMock.mockResolvedValue({ path: "/fake/.config/kilo/kilo.jsonc", created: true });
  testGenerateMock.mockResolvedValue({ ok: true, response: "OK" });
  isOllamaAvailableMock.mockResolvedValue(true); // skip the install branch for this test
  findTeamProfileMock.mockResolvedValue(null);
  resolveModelsMock.mockReturnValue({
    chatAgent: "qwen2.5-coder:7b",
    autocomplete: "qwen2.5-coder:1.5b",
    agentEnabled: true,
    familyId: "qwen2.5-coder",
  });
  discoverAgentExtensionsMock.mockResolvedValue([]);
  // Default: Continue.dev's own offer call (always made) reports declined,
  // so tests that don't care about it don't need to account for a second
  // offerExtensionInstall call landing on top of the Kilo one.
  offerExtensionInstallMock.mockResolvedValue("declined");
  patchContinueConfigMock.mockResolvedValue({ path: "/fake/.continue/config.yaml", created: true });
});

describe("waitForOllama", () => {
  it("returns true immediately if Ollama is already available on the first check", async () => {
    isOllamaAvailableMock.mockResolvedValue(true);
    const result = await waitForOllama(5, 0);
    expect(result).toBe(true);
    expect(isOllamaAvailableMock).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds once Ollama becomes available", async () => {
    isOllamaAvailableMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await waitForOllama(5, 0);
    expect(result).toBe(true);
    expect(isOllamaAvailableMock).toHaveBeenCalledTimes(3);
  });

  it("gives up honestly after exhausting retries, rather than hanging or guessing", async () => {
    isOllamaAvailableMock.mockResolvedValue(false);
    const result = await waitForOllama(3, 0);
    expect(result).toBe(false);
    expect(isOllamaAvailableMock).toHaveBeenCalledTimes(3); // exactly the retry budget, no more
  });
});

describe("runInit — 'changeEditor' loop", () => {
  it("re-invokes selectEditor when the model-choice menu returns 'changeEditor', then proceeds with the new editor", async () => {
    selectEditorMock
      .mockResolvedValueOnce({ id: "vscode" }) // first pass
      .mockResolvedValueOnce({ id: "cursor" }); // after "changeEditor"

    selectModelChoiceMock
      .mockResolvedValueOnce({ type: "changeEditor" }) // first time: back out to change editor
      .mockResolvedValueOnce({ type: "recommended" }); // second time: just proceed

    await runInit({});

    expect(selectEditorMock).toHaveBeenCalledTimes(2); // proves the loop actually re-ran editor selection
    expect(selectModelChoiceMock).toHaveBeenCalledTimes(2); // and re-showed the model menu afterward

    // The final written state reflects the SECOND editor choice, not the first.
    expect(writeStateMock).toHaveBeenCalledTimes(1);
    const writtenState = writeStateMock.mock.calls[0]?.[0];
    expect(writtenState.editor).toEqual({ id: "cursor" });
  });

  it("does NOT loop back when a normal choice (not 'changeEditor') is returned", async () => {
    selectEditorMock.mockResolvedValueOnce({ id: "vscode" });
    selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });

    await runInit({});

    expect(selectEditorMock).toHaveBeenCalledTimes(1);
    expect(selectModelChoiceMock).toHaveBeenCalledTimes(1);
  });
});

describe("runInit — Kilo Code auto-configure", () => {
  it("patches kilo.jsonc and runs a test prompt when Kilo Code is already installed", async () => {
    selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
    selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
    discoverAgentExtensionsMock.mockResolvedValueOnce([
      {
        candidate: { id: "kilocode.kilo-code", label: "Kilo Code", status: "active" },
        dir: "/fake/globalStorage/kilocode.kilo-code",
      },
    ]);

    await runInit({});

    // resolveModelsMock's default (set in the outer beforeEach) resolves
    // chatAgent to "qwen2.5-coder:7b" — confirms the actual selected model
    // is what gets wired through, not a placeholder.
    // Kilo gets the memory-sized context variant, with facts Kilo can't look up itself.
    expect(patchKiloConfigMock).toHaveBeenCalledWith("qwen2.5-coder:7b-rigup-32k", { contextTokens: 32768, toolCall: true });
    expect(testGenerateMock).toHaveBeenCalledWith("qwen2.5-coder:7b-rigup-32k");
  });

  it("falls back to the base model (no context facts) if the variant can't be created", async () => {
    selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
    selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
    discoverAgentExtensionsMock.mockResolvedValueOnce([
      {
        candidate: { id: "kilocode.kilo-code", label: "Kilo Code", status: "active" },
        dir: "/fake/globalStorage/kilocode.kilo-code",
      },
    ]);
    ensureContextVariantMock.mockRejectedValueOnce(new Error("ollama create failed"));

    await runInit({});

    expect(patchKiloConfigMock).toHaveBeenCalledWith("qwen2.5-coder:7b", { contextTokens: undefined, toolCall: true });
    expect(testGenerateMock).toHaveBeenCalledWith("qwen2.5-coder:7b");
  });

  describe("on machines where Kilo's agent isn't expected to work", () => {
    const kiloFound = () =>
      discoverAgentExtensionsMock.mockResolvedValueOnce([
        { candidate: { id: "kilocode.kilo-code", label: "Kilo Code", status: "active" }, dir: "/fake/kilo" },
      ]);
    const unreliable = { numCtx: 16384, toolCapable: true, agentReliable: false, warnings: ["16 GB"] };

    it("asks first, and leaves Kilo untouched when the answer is No (the default)", async () => {
      selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
      selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
      kiloFound();
      planForModelMock.mockResolvedValueOnce(unreliable);
      confirmKiloDespiteLimitsMock.mockResolvedValueOnce(false);

      await runInit({});

      expect(confirmKiloDespiteLimitsMock).toHaveBeenCalled();
      expect(ensureContextVariantMock).not.toHaveBeenCalled();
      expect(patchKiloConfigMock).not.toHaveBeenCalled();
    });

    it("still configures Kilo if the person opts in", async () => {
      selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
      selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
      kiloFound();
      planForModelMock.mockResolvedValueOnce(unreliable);
      confirmKiloDespiteLimitsMock.mockResolvedValueOnce(true);

      await runInit({});

      expect(patchKiloConfigMock).toHaveBeenCalledWith("qwen2.5-coder:7b-rigup-32k", { contextTokens: 16384, toolCall: true });
    });
  });

  it("does NOT attempt to configure Roo Code or Cline — only Kilo Code has a confirmed-safe format", async () => {
    selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
    selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
    discoverAgentExtensionsMock.mockResolvedValueOnce([
      {
        candidate: {
          id: "rooveterinaryinc.roo-cline",
          label: "Roo Code",
          status: "discontinued",
          note: "discontinued",
        },
        dir: "/fake/globalStorage/rooveterinaryinc.roo-cline",
      },
    ]);

    await runInit({});

    expect(patchKiloConfigMock).not.toHaveBeenCalled();
    expect(testGenerateMock).not.toHaveBeenCalled();
  });

  it("still runs the test prompt after a fresh CLI install of Kilo Code, not just when pre-found", async () => {
    selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
    selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
    discoverAgentExtensionsMock.mockResolvedValueOnce([]); // nothing installed yet (globalStorage scan empty)

    // First offerExtensionInstall call is for Continue.dev (declined, per
    // the outer beforeEach default); the second is for Kilo Code — return
    // "installed" to simulate a fresh CLI install succeeding.
    offerExtensionInstallMock
      .mockResolvedValueOnce("declined") // Continue.dev
      .mockResolvedValueOnce("installed"); // Kilo Code, freshly installed

    await runInit({});

    // Kilo gets the memory-sized context variant, with facts Kilo can't look up itself.
    expect(patchKiloConfigMock).toHaveBeenCalledWith("qwen2.5-coder:7b-rigup-32k", { contextTokens: 32768, toolCall: true });
    expect(testGenerateMock).toHaveBeenCalledWith("qwen2.5-coder:7b-rigup-32k");
  });

  it("configures Kilo Code when it's already installed via the CLI (offerExtensionInstall reports 'already-installed'), even if globalStorage scan found nothing", async () => {
    selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
    selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
    discoverAgentExtensionsMock.mockResolvedValueOnce([]);

    offerExtensionInstallMock
      .mockResolvedValueOnce("declined") // Continue.dev
      .mockResolvedValueOnce("already-installed"); // Kilo Code

    await runInit({});

    // Kilo gets the memory-sized context variant, with facts Kilo can't look up itself.
    expect(patchKiloConfigMock).toHaveBeenCalledWith("qwen2.5-coder:7b-rigup-32k", { contextTokens: 32768, toolCall: true });
    expect(testGenerateMock).toHaveBeenCalledWith("qwen2.5-coder:7b-rigup-32k");
  });

  it("does NOT configure Kilo Code if the install offer was declined or failed", async () => {
    selectEditorMock.mockResolvedValueOnce({ id: "cursor" });
    selectModelChoiceMock.mockResolvedValueOnce({ type: "recommended" });
    discoverAgentExtensionsMock.mockResolvedValueOnce([]);

    offerExtensionInstallMock
      .mockResolvedValueOnce("declined") // Continue.dev
      .mockResolvedValueOnce("declined"); // Kilo Code

    await runInit({});

    expect(patchKiloConfigMock).not.toHaveBeenCalled();
    expect(testGenerateMock).not.toHaveBeenCalled();
  });
});
