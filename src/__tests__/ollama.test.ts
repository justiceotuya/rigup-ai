import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const execaMock = vi.fn();

vi.mock("execa", () => ({
  execa: execaMock,
}));

const { ensureModel, isServerReachable } = await import("../ollama.js");

beforeEach(() => {
  execaMock.mockReset();
});

describe("ensureModel", () => {
  it("skips the pull entirely if the model is already present", async () => {
    // First call is listModels()'s `ollama list`.
    execaMock.mockResolvedValueOnce({
      stdout: "NAME                    ID    SIZE    MODIFIED\nqwen2.5-coder:7b   abc   4.7GB   2 days ago",
    });

    await ensureModel("qwen2.5-coder:7b");

    expect(execaMock).toHaveBeenCalledTimes(1); // only the `list` check, no `pull`
  });

  it("pulls with stdio: 'inherit' when the model is missing — this is the actual fix", async () => {
    // listModels() finds nothing matching.
    execaMock.mockResolvedValueOnce({ stdout: "NAME    ID    SIZE    MODIFIED" });
    // The pull call itself.
    execaMock.mockResolvedValueOnce({});

    await ensureModel("qwen2.5-coder:7b");

    expect(execaMock).toHaveBeenCalledTimes(2);
    const pullCall = execaMock.mock.calls[1];
    expect(pullCall).toBeDefined();
    expect(pullCall![0]).toBe("ollama");
    expect(pullCall![1]).toEqual(["pull", "qwen2.5-coder:7b"]);
    expect(pullCall![2]).toEqual({ stdio: "inherit" }); // not piped — this is what makes progress visible
  });
});

describe("isServerReachable", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns true when the server responds ok", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    expect(await isServerReachable()).toBe(true);
  });

  it("returns false when the server responds with a non-ok status", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await isServerReachable()).toBe(false);
  });

  it("returns false (not throws) when the connection is refused", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await isServerReachable()).toBe(false);
  });
});

describe("testGenerate", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns ok:true with the response text on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: "OK" }),
    });

    const { testGenerate } = await import("../ollama.js");
    const result = await testGenerate("qwen2.5-coder:7b");

    expect(result.ok).toBe(true);
    expect(result.response).toBe("OK");
  });

  it("sends the exact model name and a non-streaming request", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ response: "OK" }) });

    const { testGenerate } = await import("../ollama.js");
    await testGenerate("qwen2.5-coder:7b");

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://127.0.0.1:11434/api/generate");
    const body = JSON.parse(call?.[1]?.body as string);
    expect(body.model).toBe("qwen2.5-coder:7b");
    expect(body.stream).toBe(false);
  });

  it("returns ok:false with an HTTP status detail on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "model not found",
    });

    const { testGenerate } = await import("../ollama.js");
    const result = await testGenerate("does-not-exist:7b");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("404");
  });

  it("returns ok:false (not throws) on a connection error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { testGenerate } = await import("../ollama.js");
    const result = await testGenerate("qwen2.5-coder:7b");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

async function loadOllamaWithPlatform(platform: NodeJS.Platform) {
  vi.resetModules();
  vi.doMock("node:os", async () => {
    const actual = await vi.importActual<typeof import("node:os")>("node:os");
    return { ...actual, default: { ...actual, platform: () => platform }, platform: () => platform };
  });
  return import("../ollama.js");
}

describe("startOllamaServer — platform-specific strategy", () => {
  afterEach(() => {
    vi.doUnmock("node:os");
    vi.resetModules();
  });

  it("Linux: tries systemctl start ollama first, and stops there if it succeeds", async () => {
    execaMock.mockReset();
    execaMock.mockResolvedValueOnce({}); // systemctl succeeds

    const mod = await loadOllamaWithPlatform("linux");
    await mod.startOllamaServer();

    expect(execaMock).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalledWith("systemctl", ["start", "ollama"]);
  });

  it("Linux: falls back to a detached 'ollama serve' if no systemd unit exists", async () => {
    execaMock.mockReset();
    execaMock.mockRejectedValueOnce(new Error("unit not found")); // systemctl fails
    execaMock.mockReturnValueOnce({ unref: vi.fn() }); // fallback spawn

    const mod = await loadOllamaWithPlatform("linux");
    await mod.startOllamaServer();

    expect(execaMock).toHaveBeenCalledTimes(2);
    expect(execaMock).toHaveBeenNthCalledWith(2, "ollama", ["serve"], {
      stdio: "ignore",
      detached: true,
    });
  });

  it("macOS: tries opening Ollama.app first, and stops there if it succeeds", async () => {
    execaMock.mockReset();
    execaMock.mockResolvedValueOnce({}); // `open -a Ollama` succeeds

    const mod = await loadOllamaWithPlatform("darwin");
    await mod.startOllamaServer();

    expect(execaMock).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalledWith("open", ["-a", "Ollama"]);
  });

  it("macOS: falls back to a detached 'ollama serve' if the app isn't found", async () => {
    execaMock.mockReset();
    execaMock.mockRejectedValueOnce(new Error("app not found"));
    execaMock.mockReturnValueOnce({ unref: vi.fn() });

    const mod = await loadOllamaWithPlatform("darwin");
    await mod.startOllamaServer();

    expect(execaMock).toHaveBeenCalledTimes(2);
  });

  it("Windows: skips systemctl/open entirely and goes straight to the universal fallback", async () => {
    execaMock.mockReset();
    execaMock.mockReturnValueOnce({ unref: vi.fn() });

    const mod = await loadOllamaWithPlatform("win32");
    await mod.startOllamaServer();

    expect(execaMock).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalledWith("ollama", ["serve"], { stdio: "ignore", detached: true });
  });
});

describe("ensureOllamaServerRunning", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    execaMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns true immediately, without starting anything, if already reachable", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const { ensureOllamaServerRunning } = await import("../ollama.js");
    const result = await ensureOllamaServerRunning(3, 0);

    expect(result).toBe(true);
    expect(execaMock).not.toHaveBeenCalled(); // never tried to start it — it was already up
  });

  it("starts the server and retries until reachable", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("not up yet"))
      .mockRejectedValueOnce(new Error("still not up"))
      .mockResolvedValueOnce({ ok: true });
    execaMock.mockReturnValue({ unref: vi.fn() }); // the (linux, in this test env) start call

    const { ensureOllamaServerRunning } = await import("../ollama.js");
    const result = await ensureOllamaServerRunning(5, 0);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up honestly after exhausting retries, rather than hanging or claiming success", async () => {
    fetchMock.mockRejectedValue(new Error("never comes up"));
    execaMock.mockReturnValue({ unref: vi.fn() });

    const { ensureOllamaServerRunning } = await import("../ollama.js");
    const result = await ensureOllamaServerRunning(3, 0);

    expect(result).toBe(false);
  });
});
