import { execa } from "execa";
import os from "node:os";

export interface OllamaModel {
  name: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks whether the `ollama` binary is on PATH and responding at all.
 * Kept separate from listModels() so doctor can distinguish
 * "ollama not installed/running" from "ollama running but model missing" —
 * these need different fixes and the spec calls out surfacing them distinctly.
 *
 * NOTE: this only proves the *binary* exists — `ollama --version` doesn't
 * talk to the background server at all. A person can have Ollama fully
 * installed with this returning true while the server itself isn't
 * running, which is exactly what produces a "fetch failed" error in
 * Continue.dev / Kilo Code / any other client trying to reach
 * localhost:11434. Use isServerReachable() for that question instead.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    await execa("ollama", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the Ollama *server* is actually up and answering HTTP
 * requests on its default port — the thing every client (Continue.dev,
 * Kilo Code, this CLI's own model pulls) actually needs, as distinct from
 * the binary merely existing on disk.
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch("http://127.0.0.1:11434", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Best-effort attempt to start the Ollama server, platform-aware:
 * - Linux: prefers the systemd service the official install script sets
 *   up (`systemctl start ollama`), since that's the "managed" way and
 *   keeps it running across reboots; falls through if no such unit exists
 *   (manual installs, non-systemd distros).
 * - macOS: launches Ollama.app, which starts its embedded server the same
 *   way opening it from Spotlight would; falls through if the app isn't
 *   found under that name.
 * - Everywhere else (Windows, and any platform where the above didn't
 *   work): spawns `ollama serve` directly, detached so it outlives this
 *   process. This is the universal fallback, not just a Windows path.
 *
 * Doesn't wait for readiness itself — callers should poll
 * isServerReachable() afterward (see ensureOllamaServerRunning below).
 */
export async function startOllamaServer(): Promise<void> {
  const platform = os.platform();

  if (platform === "linux") {
    try {
      await execa("systemctl", ["start", "ollama"]);
      return;
    } catch {
      // No systemd service, or not managed that way — fall through.
    }
  }

  if (platform === "darwin") {
    try {
      await execa("open", ["-a", "Ollama"]);
      return;
    } catch {
      // App not found under that name — fall through.
    }
  }

  const subprocess = execa("ollama", ["serve"], { stdio: "ignore", detached: true });
  subprocess.unref();
}

/**
 * Sends a real generation request to confirm the server is not just
 * reachable but actually able to serve the specific model — this is what
 * "test the connection" means in practice, since a client like Kilo Code
 * talks to this exact endpoint. Not a substitute for driving Kilo Code's
 * own UI (that's outside what a CLI tool can do), but it exercises the
 * same server + model path Kilo Code would use, which is the meaningful
 * part of "is this actually working."
 */
export interface TestPromptResult {
  ok: boolean;
  response?: string;
  error?: string;
}

export async function testGenerate(
  modelName: string,
  prompt = "Reply with exactly one word: OK"
): Promise<TestPromptResult> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, prompt, stream: false }),
      // Generation can genuinely take a while on CPU-only hardware —
      // longer budget than the plain reachability check on purpose.
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
    }

    const data = (await res.json()) as { response?: unknown };
    return {
      ok: true,
      response: typeof data.response === "string" ? data.response : undefined,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
/**
 * The actual fix for "the binary's there but the server isn't running":
 * checks reachability first (cheap, and covers the already-running case
 * without touching anything), starts the server if needed, then polls for
 * readiness with the same honest-fallback pattern as init's
 * waitForOllama — retry a bounded number of times, then say so plainly
 * rather than hang or assume success.
 */
export async function ensureOllamaServerRunning(retries = 8, delayMs = 1000): Promise<boolean> {
  if (await isServerReachable()) return true;

  await startOllamaServer();

  for (let attempt = 0; attempt < retries; attempt++) {
    if (await isServerReachable()) return true;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return false;
}

export async function listModels(): Promise<OllamaModel[]> {
  const { stdout } = await execa("ollama", ["list"]);
  // First line is a header ("NAME  ID  SIZE  MODIFIED"); skip it.
  return stdout
    .split("\n")
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ name: line.split(/\s+/)[0] ?? "" }))
    .filter((m) => m.name.length > 0);
}

/**
 * Idempotent pull: skips models already present so `init` can be
 * safely re-run without re-downloading multi-gigabyte models.
 *
 * Uses stdio: "inherit" rather than capturing/relaying output ourselves —
 * `ollama pull`'s own progress bar (percentage, download speed, size) only
 * renders when it detects a real TTY, and which stream it writes to isn't
 * consistently documented. Piping through execa and relaying manually risks
 * silently showing nothing if it turns out to write to stderr rather than
 * stdout. Inheriting stdio sidesteps guessing entirely: whatever stream it
 * uses, the real terminal sees it directly, exactly like the installer's
 * `curl --progress-bar` output.
 */
export async function ensureModel(modelName: string): Promise<void> {
  const existing = await listModels();
  if (existing.some((m) => m.name === modelName)) return;

  await execa("ollama", ["pull", modelName], { stdio: "inherit" });
}

/**
 * Lists currently resident/running models — used by the RAM guard to
 * detect overlapping heavy jobs.
 */
export async function runningModels(): Promise<OllamaModel[]> {
  const { stdout } = await execa("ollama", ["ps"]);
  return stdout
    .split("\n")
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ name: line.split(/\s+/)[0] ?? "" }))
    .filter((m) => m.name.length > 0);
}

export interface ModelFacts {
  /** On-disk/in-memory size of the weights, in bytes (from /api/tags). */
  sizeBytes: number | null;
  /** Architecture fields from /api/show (e.g. "qwen2.block_count"). */
  modelInfo: Record<string, unknown>;
  /** Ollama-reported capabilities, e.g. ["completion", "tools"]. */
  capabilities: string[];
}

/** Best-effort: returns what Ollama will tell us, never throws. */
export async function getModelFacts(modelName: string): Promise<ModelFacts> {
  const facts: ModelFacts = { sizeBytes: null, modelInfo: {}, capabilities: [] };
  try {
    const res = await fetch("http://127.0.0.1:11434/api/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = (await res.json()) as { model_info?: unknown; capabilities?: unknown };
      if (data.model_info && typeof data.model_info === "object") {
        facts.modelInfo = data.model_info as Record<string, unknown>;
      }
      if (Array.isArray(data.capabilities)) {
        facts.capabilities = data.capabilities.filter((c): c is string => typeof c === "string");
      }
    }
  } catch {
    /* leave defaults */
  }
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = (await res.json()) as { models?: { name?: string; model?: string; size?: number }[] };
      const hit = data.models?.find((m) => m.name === modelName || m.model === modelName);
      if (hit && typeof hit.size === "number") facts.sizeBytes = hit.size;
    }
  } catch {
    /* leave defaults */
  }
  return facts;
}
