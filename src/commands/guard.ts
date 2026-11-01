import pc from "picocolors";
import { runningModels } from "../ollama.js";

const POLL_INTERVAL_MS = 5000;
let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Polls `ollama ps` and warns when more than one model is resident at
 * once — the "close one heavy job before starting another" discipline
 * from the original thread, automated instead of manual.
 *
 * v1 implementation: foreground poll loop (Ctrl+C to stop). Sequenced
 * last per the build plan since a true background daemon has real
 * platform variance (macOS vs Linux process introspection) worth
 * tackling once the rest of the CLI is solid.
 */
export async function runGuard(action: "start" | "stop"): Promise<void> {
  if (action === "stop") {
    if (intervalHandle) clearInterval(intervalHandle);
    console.log(pc.gray("Guard stopped."));
    return;
  }

  console.log(pc.bold("LocalStack guard — watching for overlapping heavy model jobs"));
  console.log(pc.gray("(Ctrl+C to stop)\n"));

  intervalHandle = setInterval(async () => {
    try {
      const running = await runningModels();
      if (running.length > 1) {
        console.log(
          pc.yellow(
            `[guard] ${running.length} models resident at once: ${running
              .map((m) => m.name)
              .join(", ")} — consider closing one before starting new work.`
          )
        );
      }
    } catch {
      // Ollama not reachable — stay quiet rather than spamming errors on
      // every poll tick; `doctor` is the right place to surface that.
    }
  }, POLL_INTERVAL_MS);
}
