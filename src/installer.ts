import { execa } from "execa";
import { createWriteStream } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";

const BAR_WIDTH = 30;

/**
 * Installs Ollama for the current platform, then returns whether it succeeded.
 *
 * - macOS/Linux: runs the official install script (`curl -fsSL
 *   https://ollama.com/install.sh | sh`) with stdio inherited. The script's
 *   own internal curl calls use `--progress-bar`, so the download progress
 *   is visible natively — we don't need to reimplement it for this path.
 * - Windows: no equivalent silent CLI installer exists, so we download the
 *   official .exe ourselves (with our own progress bar, since there's no
 *   script to inherit output from) and hand off to the interactive
 *   installer, since Windows installs typically need a GUI/elevation step.
 */
export async function installOllama(): Promise<boolean> {
  const platform = os.platform();

  if (platform === "darwin" || platform === "linux") {
    console.log(pc.gray("Running the official Ollama install script...\n"));
    try {
      await execa("sh", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], {
        stdio: "inherit",
      });
      return true;
    } catch {
      console.log(pc.red("\nInstall script failed — see output above."));
      return false;
    }
  }

  if (platform === "win32") {
    return installOllamaWindows();
  }

  console.log(pc.red(`\nAutomatic install isn't supported on "${platform}".`));
  return false;
}

async function installOllamaWindows(): Promise<boolean> {
  const url = "https://ollama.com/download/OllamaSetup.exe";
  const dest = path.join(os.tmpdir(), "OllamaSetup.exe");

  console.log(pc.gray("Downloading Ollama installer...\n"));

  const downloaded = await downloadWithProgress(url, dest);
  if (!downloaded) return false;

  console.log(pc.gray("\nLaunching the installer — finish setup in the window that opens."));
  try {
    execa(dest, [], { stdio: "ignore", detached: true }).catch(() => {});
    return true;
  } catch {
    console.log(pc.red(`\nCouldn't launch it automatically. Run it manually from: ${dest}`));
    return false;
  }
}

function downloadWithProgress(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    const file = createWriteStream(dest);

    https
      .get(url, (res) => {
        // ollama.com/download typically redirects to a CDN URL — follow one hop.
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          file.close();
          downloadWithProgress(res.headers.location, dest).then(resolve);
          return;
        }

        if (res.statusCode !== 200) {
          console.log(pc.red(`\nDownload failed: HTTP ${res.statusCode}`));
          resolve(false);
          return;
        }

        const total = Number(res.headers["content-length"] ?? 0);
        let downloadedBytes = 0;

        res.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (total > 0) renderProgressBar(downloadedBytes, total);
        });

        res.pipe(file);

        file.on("finish", () => {
          file.close();
          process.stdout.write("\n");
          resolve(true);
        });

        res.on("error", (err) => {
          console.log(pc.red(`\nDownload error: ${err.message}`));
          resolve(false);
        });
      })
      .on("error", (err) => {
        console.log(pc.red(`\nDownload error: ${err.message}`));
        resolve(false);
      });
  });
}

/**
 * Pure-ish rendering helper, split out from downloadWithProgress so the
 * bar-drawing logic can be unit tested without mocking https.
 */
export function formatProgressBar(downloaded: number, total: number): string {
  const ratio = total > 0 ? Math.min(downloaded / total, 1) : 0;
  const filled = Math.round(BAR_WIDTH * ratio);
  const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
  const pct = Math.round(ratio * 100);
  const toMb = (n: number) => (n / 1024 ** 2).toFixed(1);
  return `[${bar}] ${pct}% (${toMb(downloaded)}MB / ${toMb(total)}MB)`;
}

function renderProgressBar(downloaded: number, total: number): void {
  process.stdout.write(`\r  ${formatProgressBar(downloaded, total)}`);
}
