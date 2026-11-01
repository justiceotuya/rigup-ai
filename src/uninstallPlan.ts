export interface UninstallStep {
  label: string;
  /** Human-readable shell commands, run in order. Safe to display before running. */
  commands: string[];
}

/**
 * What it takes to remove Ollama itself, per platform. Built from the
 * community-documented teardown of the official install.sh/install.ps1
 * scripts (Ollama has no built-in uninstaller of its own) — reversed from
 * what the installer actually does: on macOS/Linux it drops files as root
 * and (on Linux) registers a systemd service, so removal needs the same
 * privileges. Kept as data, not inline in the command, so the actual steps
 * are unit-testable without executing real shell commands.
 *
 * Windows has no safe automatable path — there's no single documented
 * uninstaller entry point to trust, so this hands off to the OS's own
 * "Apps & Features" UI rather than guessing an uninstaller path and
 * silently failing (or worse, deleting the wrong thing).
 */
export function ollamaUninstallSteps(platform: NodeJS.Platform): UninstallStep[] {
  if (platform === "darwin") {
    return [
      { label: "Quit the Ollama app if it's running", commands: ["pkill -x Ollama || true"] },
      { label: "Remove the application bundle", commands: ["sudo rm -rf /Applications/Ollama.app"] },
      { label: "Remove the CLI symlink", commands: ["sudo rm -f /usr/local/bin/ollama"] },
    ];
  }

  if (platform === "linux") {
    return [
      {
        label: "Stop and disable the background service",
        commands: ["sudo systemctl stop ollama || true", "sudo systemctl disable ollama || true"],
      },
      {
        label: "Remove the systemd service file",
        commands: [
          "sudo rm -f /etc/systemd/system/ollama.service",
          "sudo systemctl daemon-reload || true",
        ],
      },
      { label: "Remove the binary", commands: ['sudo rm -f "$(which ollama)"'] },
      {
        label: "Remove the dedicated system user/group, if present",
        commands: ["sudo userdel ollama || true", "sudo groupdel ollama || true"],
      },
      {
        label: "Remove system-wide model storage, if present",
        commands: ["sudo rm -rf /usr/share/ollama || true"],
      },
    ];
  }

  // win32 and anything else.
  return [
    {
      label: "Open Windows 'Apps & Features' — uninstall Ollama from there",
      commands: ["start ms-settings:appsfeatures"],
    },
  ];
}

/** Whether a platform's uninstall steps require elevated privileges. */
export function requiresElevation(platform: NodeJS.Platform): boolean {
  return platform === "darwin" || platform === "linux";
}
