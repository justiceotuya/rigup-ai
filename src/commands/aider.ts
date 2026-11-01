import pc from "picocolors";
import { execa } from "execa";
import { readState } from "../state.js";

const DEFAULT_OLLAMA_API_BASE = "http://127.0.0.1:11434";

/**
 * Aider's documented Ollama setup is `--model ollama_chat/<model>` with
 * OLLAMA_API_BASE pointing at the local server. (`ollama/` uses Ollama's
 * plain completion endpoint; `ollama_chat/` is the chat endpoint aider
 * recommends.) A user-set OLLAMA_API_BASE is respected.
 */
export function aiderLaunch(
  chatModel: string,
  env: NodeJS.ProcessEnv = process.env
): { args: string[]; env: NodeJS.ProcessEnv } {
  return {
    args: ["--model", `ollama_chat/${chatModel}`],
    env: { ...env, OLLAMA_API_BASE: env.OLLAMA_API_BASE ?? DEFAULT_OLLAMA_API_BASE },
  };
}

/**
 * Plain `pip install aider-chat` breaks on Python versions aider doesn't
 * support yet (pip silently falls back to an ancient release that then fails
 * to build — seen on real hardware with Python 3.14). Aider's own installers
 * bring their own Python 3.12 in an isolated environment, so point at those.
 */
export function aiderInstallHint(platform: NodeJS.Platform = process.platform): string {
  const oneLiner =
    platform === "win32"
      ? 'powershell -ExecutionPolicy ByPass -c "irm https://aider.chat/install.ps1 | iex"'
      : "curl -LsSf https://aider.chat/install.sh | sh";
  return [
    "aider isn't installed (or isn't on your PATH). Install it with aider's own installer,",
    "which sets up an isolated Python 3.12 so your system Python version doesn't matter:",
    "",
    `  ${oneLiner}`,
    "",
    "  or: python3 -m pip install aider-install && aider-install",
    "",
    "Then open a new terminal and re-run `rigup aider`.",
  ].join("\n");
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

export async function runAider(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log(pc.red("No RigUp AI state found — run `rigup init` first."));
    process.exitCode = 1;
    return;
  }

  const { args, env } = aiderLaunch(state.models.chatAgent);
  console.log(pc.gray(`Launching aider ${args.join(" ")} ...`));

  try {
    await execa("aider", args, { stdio: "inherit", env });
  } catch (err: unknown) {
    if (isNotFound(err)) {
      console.log(pc.red(`\n${aiderInstallHint()}`));
    } else {
      // aider started and exited non-zero (an error inside aider, or the
      // user quit with Ctrl+C) — that's not an installation problem.
      console.log(pc.yellow("\naider exited with an error — see its output above."));
    }
    process.exitCode = 1;
  }
}
