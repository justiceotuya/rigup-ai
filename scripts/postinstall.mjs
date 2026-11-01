#!/usr/bin/env node
/**
 * Runs automatically after `npm install` so `localstack` works as a real
 * shell command without a separate manual build+link step. Deliberately
 * cautious about a few real failure/recursion modes rather than assuming
 * this always works cleanly:
 *
 * - `npm link` can trigger this project's own lifecycle scripts again
 *   (npm treats linking similarly to a local install in some versions) —
 *   guarded with an env var so a re-entrant run exits immediately instead
 *   of looping.
 * - If this package ever ends up installed as a dependency *inside*
 *   another project (nested in that project's node_modules), silently
 *   hijacking their `npm install` to register a global `localstack`
 *   command would be a surprising, unwanted side effect — skipped.
 * - CI environments and anyone who explicitly opts out
 *   (LOCALSTACK_SKIP_POSTINSTALL=1) are skipped too.
 * - Every failure path prints a clear, actionable manual fallback and
 *   exits 0 — a linking problem should never make `npm install` itself
 *   look like it failed, since `npm run dev` still works regardless.
 */
import { execa } from "execa";
import path from "node:path";

async function main() {
  if (process.env.LOCALSTACK_POSTINSTALL_RUNNING) {
    return; // re-entrant call (see the npm-link recursion note above)
  }

  if (process.env.CI) {
    console.log("[localstack] Skipping automatic build+link (CI environment detected).");
    return;
  }

  if (process.env.LOCALSTACK_SKIP_POSTINSTALL) {
    console.log("[localstack] Skipping automatic build+link (LOCALSTACK_SKIP_POSTINSTALL is set).");
    return;
  }

  const cwd = process.cwd();
  const nodeModulesSegments = cwd.split(path.sep).filter((segment) => segment === "node_modules");
  if (nodeModulesSegments.length > 0) {
    // Installed as someone else's dependency, not run at this project's
    // own root — don't register a global command on their behalf.
    return;
  }

  console.log("[localstack] Building...");
  try {
    await execa("npm", ["run", "build"], { stdio: "inherit" });
  } catch {
    console.warn(
      "\n[localstack] ⚠️  Build failed — `localstack` won't be linked. Run `npm run build` to see the error, then `npm link` once it succeeds."
    );
    return;
  }

  console.log("[localstack] Linking the `localstack` command globally...");
  try {
    await execa("npm", ["link"], {
      stdio: "inherit",
      env: { ...process.env, LOCALSTACK_POSTINSTALL_RUNNING: "1" },
    });
  } catch {
    console.warn(
      "\n[localstack] ⚠️  `npm link` failed — often a permissions issue with the global npm directory. Run `npm link` yourself (you may need elevated permissions), or just use `npm run dev -- <command>` instead."
    );
    return;
  }

  // The step that actually matters: confirm `localstack` is recognized as
  // a real command now, not just that `npm link` exited without error —
  // a stale PATH is a common enough reason those two can disagree.
  try {
    await execa("localstack", ["--version"]);
    console.log("\n[localstack] ✅ Ready — try `localstack doctor`.");
  } catch {
    console.warn(
      "\n[localstack] ⚠️  `npm link` succeeded, but `localstack` isn't recognized on PATH yet."
    );
    try {
      const { stdout } = await execa("npm", ["prefix", "-g"]);
      const globalBin = path.join(stdout.trim(), process.platform === "win32" ? "" : "bin");
      console.warn(`[localstack]    Global npm bin directory: ${globalBin}`);
    } catch {
      // Best-effort hint only — not fatal if this lookup itself fails.
    }
    console.warn(
      "[localstack]    Add that directory to your shell PATH and open a new terminal, or use `npm run dev -- <command>` in the meantime."
    );
  }
}

main();
