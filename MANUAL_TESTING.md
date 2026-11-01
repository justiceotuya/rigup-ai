# Manual Testing Checklist

Everything in this file is here because it genuinely can't be verified from
an automated sandbox: no real Windows machine, no real `sudo`, no real
Ollama/Continue.dev/Kilo Code installs. The 141 automated tests cover the
logic; this covers the parts that only exist once you run it on hardware
you actually own.

> **Note on provenance**: a separate working copy of this project
> (independently built on an earlier snapshot) added the interactive
> launcher, CLI-based `--list-extensions` detection, Continue.dev's own
> extension auto-install, and — critically — caught a real bug via actual
> testing against a live Ollama daemon: Kilo Code's local-Ollama base URL
> needs a `/v1` suffix or every request 404s. That fix has been merged back
> in here (including into the config *writer*, which had the same latent
> bug the manually-tested fix corrected) and re-verified with unit tests
> and a real end-to-end run in this sandbox, but the fact that a human
> testing on real hardware caught something a sandbox couldn't is worth
> keeping in mind for everything else below marked "never watched work
> against a real install."

## 1. Real `init` end-to-end (highest priority)

- [ ] On a machine *without* Ollama installed, run `rigup init` and
      actually say yes to the install prompt. Confirm the progress bar
      (Windows) or the script's own `curl --progress-bar` output
      (macOS/Linux) renders correctly, not garbled.
- [ ] **New (macOS/Linux)**: confirm setup continues automatically after
      the install script finishes and you confirm the "Continue setting up
      RigUp AI now?" prompt — no manual re-run should be needed. This is
      the part that most needs real-hardware confirmation: the retry logic
      (`waitForOllama` in `src/commands/init.ts`) and the confirmation gate
      (`confirmContinueSetup` in `src/prompts.ts`) are both unit-tested with
      mocks, but never watched succeed together against a real
      freshly-installed `ollama` binary and real PATH resolution.
- [ ] **New**: confirm declining "Continue setting up RigUp AI now?" exits
      cleanly without pulling any models or touching editor config — only
      Ollama itself should be installed at that point.
- [ ] **New (Windows)**: confirm it still asks you to finish the installer
      window and re-run manually — this is intentional, not a bug, since
      the installer is a detached GUI process with no reliable "done" signal.
- [ ] Re-run `init` after that completes. Confirm models pull and Continue.dev's
      `~/.continue/config.yaml` gets created.
- [ ] **New**: confirm the Ollama server actually gets started when it's
      installed but not running (e.g. after a reboot, or if the app was
      closed) — `init` and `doctor` should both correctly report/fix
      "binary present, server down" as a distinct case from "not
      installed." This was the root cause of a real "fetch failed" error
      in Kilo Code reported during development; the fix (`isServerReachable`
      + `startOllamaServer` in `src/ollama.ts`) is unit-tested per-platform
      with mocked `execa`/`fetch`, but never watched actually start a real
      Ollama server from a cold "installed but not running" state.
- [ ] **New**: confirm `ollama pull`'s native download progress (percentage,
      speed, size) actually shows up on screen while a model is pulling —
      this used to only listen on `stdout`, which may have been silently
      showing nothing if Ollama writes its progress to `stderr` instead.
      The fix switched to `stdio: "inherit"` so it doesn't matter which
      stream Ollama uses, but this specific claim ("progress is now
      visible") could only be unit-tested at the level of "the right
      execa call was made" — never watched render as real output on a
      terminal.
- [ ] **New**: confirm the model-selection prompt appears right after Ollama
      is confirmed present, with the design doc's tier-appropriate model
      pre-selected as the default (hitting Enter should just work). Try
      "Pick a different model family" and "Enter model tags manually" too —
      this prompt could only be typechecked and unit-tested at the
      surrounding-logic level in the sandbox this was built in (no real
      Ollama binary to get past the install-check gate), never actually
      rendered end-to-end.
- [ ] **New**: try the "⬅ Go back" options — from the model-family picker,
      and by pressing Esc on the custom model-tag prompts and the custom
      editor app-dir-name prompt. Confirm each one returns to its parent
      menu rather than exiting the whole command. Also try the model-choice
      menu's "⬅ Actually, change my editor" entry specifically — this one
      jumps between two genuinely separate top-level steps (editor
      selection and model selection) and has the most moving parts of the
      back-navigation additions. The looping logic itself is unit-tested
      with mocked `@clack/prompts` calls (and every one of these was
      confirmed to actually fail without its fix, not just pass
      coincidentally — including a full `runInit` test proving the
      re-selected editor actually ends up in the written state, not just
      that the prompt fires again), but never watched render as a real
      interactive menu.
- [ ] Open Continue.dev in your actual editor afterward and confirm the two
      model entries ("RigUp AI — Chat/Agent" and "RigUp AI — Autocomplete")
      actually appear and work — chat responds, autocomplete ghost-text fires.
- [ ] Run `rigup switch chat 3b`, then reopen Continue.dev and confirm
      the chat model actually changed (not just the config file).

## 2. Config Writer against a real pre-existing config

- [ ] If you already have a `~/.continue/config.yaml` with your own models in
      it, run `rigup init` and confirm your existing entries are
      **untouched** — this is the whole point of the merge-not-overwrite
      design, and it needs to be seen working against a real file, not just
      the synthetic fixtures in `configWriter.test.ts`.
- [ ] If you only have a legacy `~/.continue/config.json`, confirm `init`
      creates a new `config.yaml` alongside it *without modifying the json
      file*, and confirm Continue.dev actually picks up the new yaml file
      (per Continue's own docs, yaml should take priority — verify that's
      still true in whatever version you have installed).

## 3. Agent extension detection + config

- [ ] With Kilo Code already installed, run `rigup init` and confirm it
      **auto-configures** it (not just detects it) — check
      `~/.config/kilo/kilo.jsonc` afterward for the `model`,
      `provider.ollama.models`, and `provider.ollama.options.baseURL`
      entries. **Specifically confirm the `baseURL` is
      `http://localhost:11434/v1` (with the `/v1` suffix)** — this was a
      real bug caught by testing against a live Ollama daemon (Kilo's
      client 404s without it), fixed in both the writer and the guided
      manual steps, and this is the one item in this whole file that's
      already been confirmed against real hardware rather than only
      sandboxed. Still worth re-checking here since it's easy for a merge
      to silently drop a one-line fix like this.
- [ ] Beyond the `baseURL`, the rest of `kiloConfigWriter.ts` is tested
      against real temp-directory fixtures (merge behavior, comment
      preservation) and its path/format claims are backed by Kilo's own
      docs, but it's never been run against a real Kilo Code install to
      confirm the extension actually picks up the written config without a
      restart, or picks it up at all if Kilo's schema has changed since
      these docs were fetched.
- [ ] **New**: confirm the test-prompt step actually works — after Kilo
      Code is configured, `init` should send a real request to
      `http://127.0.0.1:11434/api/generate` and report success/failure.
      Confirm this succeeds when the model is actually pulled and loaded,
      and fails with a sensible message when it isn't (e.g. try it against
      a model name that was never pulled).
- [ ] With Kilo Code (or Roo Code, or Cline) actually installed, run
      `rigup doctor` and confirm it's detected at the right path —
      this proves `globalStorageDir()` resolves correctly for your specific
      editor, not just in the mocked-`os` unit tests.
- [ ] With *no* agentic extension installed, and your editor's CLI
      (`cursor`, `code`, `windsurf`, or `codium`) on PATH, run `rigup
      init` and confirm it offers to install Kilo Code automatically, that
      the install actually works, and that it gets configured + test-prompted
      immediately afterward — the extension should appear in your editor,
      already pointed at Ollama, after a reload. This was proven against a
      fake `cursor` binary in the build sandbox (confirmed the right
      `--install-extension kilocode.kilo-code` call happens), but never
      against a real Cursor/VS Code/Windsurf install.
- [ ] With the CLI *not* on PATH, confirm the fallback message is
      accurate — it should mention the specific "Shell Command: Install
      '<bin>' in PATH" step needed to enable auto-install next time.
- [ ] If Roo Code or Cline is what's installed (not Kilo Code), confirm
      RigUp AI correctly falls back to printing manual setup steps rather
      than attempting to write to `kilo.jsonc` (which wouldn't be their
      config file at all).

## 4. Interactive launcher and Continue.dev extension install

- [ ] Run bare `rigup` (no subcommand) and confirm the command picker
      renders correctly and dispatches to the right handler for each
      choice — `switch` and `guard` should then prompt for their required
      args (role/size, start/stop) rather than erroring. This was proven
      to render *something* in this sandbox (piped stdin showed the
      picker appear), but the full dispatch-and-prompt-for-args flow was
      only unit-tested with mocks, never driven interactively end-to-end.
- [ ] Run `rigup init` with Continue.dev's extension **not** already
      installed, and confirm it offers to install it via the editor CLI
      (`code --install-extension Continue.continue`), separately from
      writing the config file. Confirm the extension actually shows up in
      your editor afterward, already pointed at the RigUp AI models from
      the config file `init` wrote moments earlier.
- [ ] Confirm `isExtensionInstalledViaCli` (`--list-extensions`) correctly
      reports an extension as already-installed when it's present but its
      globalStorage folder doesn't exist yet (i.e. installed but never
      opened) — this is the scenario it was specifically added to catch.

## 5. Automatic postinstall build+link

- [ ] Run `npm install` on a real machine as a regular (non-root) user and
      confirm `scripts/postinstall.mjs` builds, links, and reports
      `rigup` as ready — this was verified end-to-end in the build
      sandbox, but that sandbox runs as root, where `npm link`'s
      permission behavior can differ from a normal user's global npm
      directory (sometimes requiring `sudo`, or npm being configured with
      a user-writable global prefix). Confirm the failure path is
      accurate too if it does need elevated permissions — it should print
      a clear "run `npm link` yourself" message, not fail silently or
      break `npm install`.
- [ ] Confirm `rigup --help` / `rigup doctor` actually work in a
      **fresh terminal window** afterward, not just the same shell session
      `npm install` ran in (some shells cache PATH lookups per-session).
- [ ] Confirm `RIGUP_SKIP_POSTINSTALL=1 npm install` and a CI
      environment (`CI=true`) both correctly skip the automatic link —
      verified with `npm run postinstall` directly in the sandbox, but not
      through an actual `npm install` invocation with those variables set,
      and not in a real CI runner.
- [ ] Confirm nesting this package inside another project's `node_modules`
      (e.g. `npm install ./rigup` from a different project) does
      *not* trigger the build+link — this guard was written and reasoned
      through but never actually exercised against a real nested install.

## 6. Windows specifically

- [ ] Confirm `installOllama()`'s download progress bar renders correctly in
      both PowerShell and cmd.exe.
- [ ] Confirm the installer handoff (launching `OllamaSetup.exe`) actually
      works and `ollama` ends up on PATH afterward.
- [ ] Confirm `globalStorageDir()` resolves correctly for Cursor specifically
      on Windows (`%APPDATA%\Cursor\User\globalStorage`) — this was verified
      against documentation, never against a real Windows filesystem.

## 7. Uninstall — the genuinely destructive path

- [ ] On a disposable VM or a machine you don't mind reinstalling Ollama on,
      run `rigup uninstall`, select "Ollama itself," and actually type
      the confirmation phrase. Confirm:
      - macOS/Linux: the `sudo` commands in `uninstallPlan.ts` actually work
        against a real install (service stops, binary removed, app bundle
        gone).
      - Windows: "Apps & Features" actually opens via `ms-settings:appsfeatures`.
- [ ] Confirm declining the confirmation phrase (typing anything else) truly
      leaves Ollama untouched.

## Results log

| Date | Machine | Editor | What ran | Result |
| --- | --- | --- | --- | --- |
| 2026-11-01 | macOS, Apple Silicon, 16 GB (Ollama already installed and running) | Cursor | `rigup init` (recommended models), `rigup doctor` | ✅ Pass — tier detected as 16gb; `qwen2.5-coder:7b` + `:1.5b` pulled; Continue.dev config updated (existing user models untouched); Continue extension detected as installed; Kilo Code found and configured; test prompt answered "OK"; all 7 doctor checks green |
| 2026-11-01 | same | Cursor | Rename migration on a real pre-rename config | ✅ Pass — no duplicate entries; Continue shows exactly two `RigUp AI — …` entries; Kilo label is `(RigUp AI)`. Note: the config's top-level `name: LocalStack` (written by the old version at creation) is intentionally left alone; see the cleanup issue |

Still to run on real hardware: `switch`, `uninstall`, `guard`, `aider`, fresh-machine Ollama install (§1), Linux (§1), Windows (§6).

## What's already been verified, so you don't need to re-check it

- Hardware/RAM tiering logic — unit tested directly.
- Editor path resolution (Cursor vs VS Code vs Windsurf, per-OS) — unit
  tested with mocked `os.platform()`, and cross-checked against real
  documentation (Cursor's path was directly confirmed via search, not guessed).
- Agent extension discovery logic (Kilo Code vs Roo Code vs Cline matching,
  case-insensitivity, multiple-installed-at-once) — unit tested against a
  real temp directory, and exercised end-to-end against a fake `$HOME` in
  this sandbox (see prior conversation).
- Continue.dev config writer — unit tested against a real temp directory
  and `yaml` library, including a regression test for a real formatting bug
  (flow-style vs block-style YAML) that was caught and fixed during
  development, not just assumed correct.
- `uninstall`'s file-deletion path (`~/.rigup` removal) — exercised
  end-to-end against a fake `$HOME`, confirmed via `ls` before/after.
- The destructive-confirmation phrase matching — unit tested directly.
