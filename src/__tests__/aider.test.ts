import { describe, it, expect } from "vitest";
import { aiderLaunch, aiderInstallHint } from "../commands/aider.js";

describe("aiderLaunch", () => {
  it("uses aider's documented ollama_chat/ prefix", () => {
    expect(aiderLaunch("qwen2.5-coder:7b", {}).args).toEqual(["--model", "ollama_chat/qwen2.5-coder:7b"]);
  });

  it("defaults OLLAMA_API_BASE to the local server", () => {
    expect(aiderLaunch("m", {}).env.OLLAMA_API_BASE).toBe("http://127.0.0.1:11434");
  });

  it("respects an OLLAMA_API_BASE the user already set", () => {
    const { env } = aiderLaunch("m", { OLLAMA_API_BASE: "http://gpu-box:11434" });
    expect(env.OLLAMA_API_BASE).toBe("http://gpu-box:11434");
  });
});

describe("aiderInstallHint", () => {
  it("never suggests bare `pip install aider-chat` (breaks on unsupported Python versions)", () => {
    for (const platform of ["darwin", "linux", "win32"] as const) {
      expect(aiderInstallHint(platform)).not.toMatch(/pip install aider-chat/);
    }
  });

  it("gives the shell one-liner on macOS/Linux and the PowerShell one on Windows", () => {
    expect(aiderInstallHint("darwin")).toContain("https://aider.chat/install.sh");
    expect(aiderInstallHint("win32")).toContain("https://aider.chat/install.ps1");
  });
});
