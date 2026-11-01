# RigUp AI

Provision and manage a local, offline AI coding stack: [Ollama](https://ollama.com) +
[Continue.dev](https://continue.dev) + [Kilo Code](https://kilocode.ai) +
optional [Aider](https://aider.chat) — hardware-aware, zero telemetry.

```bash
rigup init     # detect hardware → install Ollama → pull the right models → wire up your editor
rigup doctor   # tell me exactly what's broken
```

> **Formerly "LocalStack".** Renamed to avoid confusion with the LocalStack AWS emulator.
> Existing setups carry over: state in `~/.localstack` is still read, and Continue.dev
> entries named `LocalStack — …` are updated in place rather than duplicated.

## Who it's for

Developers who want a private, free AI coding assistant that runs on their own machine,
without spending an afternoon reading Ollama, Continue.dev and Kilo Code docs to get the
model tags, config paths and editor extensions right. Also teams who want everyone on the
same local setup: commit a `rigup.yaml` and `rigup init` picks it up.

## How it compares

Wiring local models into coding tools is a crowded space, so here's where RigUp AI fits:

| Tool | What it does | Difference from RigUp AI |
| --- | --- | --- |
| [`ollama launch`](https://docs.ollama.com/cli.md) (Ollama ≥ 0.15) | Configures and launches Claude Code, Codex, OpenCode, Droid or VS Code against an Ollama model | Assumes Ollama is already installed and you've picked a model. Doesn't pick models for your RAM, doesn't set up Continue.dev or Kilo Code autocomplete, and has no doctor/uninstall |
| Continue.dev's Ollama autodetect | Lists models you've already pulled inside Continue | One extension only; you still install Ollama and choose and pull models yourself |
| [ollama-scout](https://pypi.org/project/ollama-scout/), [ollama-spark](https://pypi.org/project/ollama-spark/) | Detect hardware and recommend Ollama models | Recommendation only; they don't configure any editor |
| [offgrid-ai](https://github.com/eeshansrivastava89/offgrid-ai) | Model picker that launches the Pi coding agent | Terminal agent, not editor integration; no Windows |
| Manual setup guides | Step-by-step docs per tool | RigUp AI automates the same steps, idempotently, with a health check and clean uninstall |

**RigUp AI's niche:** one command from a bare machine to a working, *editor-native* setup
(chat, agent and autocomplete) across VS Code, Cursor, Windsurf and VSCodium, sized to your
hardware, with merge-not-overwrite config writing, a real test prompt, `doctor`, and a
granular `uninstall`.

## Status

Scaffolded and runnable. Implements the P0 slice from the design spec:

- [x] Hardware detection + tiering (`src/detector.ts`, unit-tested)
- [x] **Editor-agnostic** config path resolution — VS Code, Cursor, Windsurf, VSCodium, or anything else (`src/editors.ts`, `src/paths.ts`, unit-tested)
- [x] Colorful, playful interactive prompts via `@clack/prompts` — editor picker, install confirmation, step-by-step status (`src/prompts.ts`)
- [x] State manifest read/write with schema validation, including the chosen editor (`src/state.ts`)
- [x] Ollama wrapper: availability check, idempotent model pull, running-model check (`src/ollama.ts`)
- [x] Ollama installer: prompts before installing, runs the official script on macOS/Linux (native progress bar via curl), downloads + launches the official installer on Windows (own progress bar) (`src/installer.ts`) — **setup continues automatically afterward on macOS/Linux, no manual re-run needed**
- [x] **Interactive launcher** — running bare `rigup` (no subcommand) shows a command picker and prompts for any missing args (`switch`'s role/size, `guard`'s start/stop) instead of erroring (`src/launcher.ts`, `src/cliCommands.ts`)
- [x] **Continue.dev's own extension gets auto-installed too**, not just its config file — via the editor's CLI (`code --install-extension Continue.continue`, etc.), the same mechanism used for Kilo Code (`src/continueExtension.ts`, `src/offerExtensionInstall.ts`)
- [x] **CLI-based "already installed?" check** (`--list-extensions`) as a second detection path alongside the globalStorage scan, so an extension installed-but-never-opened doesn't get offered again (`isExtensionInstalledViaCli` in `src/editorCli.ts`)

## After the Ollama install: automatic vs. manual continuation

**macOS/Linux**: once the official install script finishes, `init` retries
detecting Ollama a few times (covering brief PATH/filesystem settling),
then asks — "🦙 Ollama is ready! Continue setting up RigUp AI now?" —
before pulling any models or touching editor config. Confirming continues
straight through in the same run, no need to re-invoke the command
yourself. Declining exits cleanly; only Ollama itself has been installed at
that point, nothing else has been touched. If Ollama genuinely can't be
detected after retrying, it says so honestly and asks for a fresh terminal
rather than hanging or guessing.

**Windows**: still asks you to finish the installer and re-run manually.
This isn't an oversight — the Windows installer is a detached GUI process
RigUp AI hands off to and can't reliably know when (or whether) it
finishes, so guessing "done" and pulling multi-gigabyte models before
Ollama is actually ready would be worse than asking you to come back.
- [x] `rigup init` — asks which editor you use, detects hardware, installs Ollama if missing, pulls tiered models, writes state
- [x] `rigup doctor` — health check with distinct failure states, shows which editor is configured
- [x] `rigup switch <role> <size>` — swap a model without full re-init
- [x] `rigup guard start|stop` — foreground RAM-contention watcher (P1, functional but not yet a background daemon)
- [x] `rigup aider` — launches aider pre-wired to your configured chat model
- [x] `rigup uninstall` — granular, confirmed removal of RigUp AI settings, pulled models, and/or Ollama itself (`src/uninstallPlan.ts`, `src/commands/uninstall.ts`)
- [x] **Config Writer for Continue.dev** — real, round-trip YAML editing (`src/configWriter.ts`), merge-not-overwrite, unit-tested including a regression test for a real formatting bug caught during development
- [x] **Kilo Code config auto-written** — confirmed against Kilo's own docs (`~/.config/kilo/kilo.jsonc`, every platform); `src/kiloConfigWriter.ts` sets the model and registers it, comment-preserving via `jsonc-parser`
- [x] **Guided setup for Roo Code / Cline** — no equivalent first-party confirmation found for these two, so they still get accurate manual steps instead of a writer; see `src/agentExtensionGuide.ts`
- [x] **Extension auto-install** — if no agentic extension is found and the editor's own CLI (`code`/`cursor`/`windsurf`/`codium`) is on PATH, `init` offers to install Kilo Code automatically (`src/editorCli.ts`), then configures it and runs a test prompt
- [x] **Real connection test** — after configuring Kilo Code, `init`/`switch` send an actual generation request to the configured model and report whether it responded (`testGenerate()` in `src/ollama.ts`)
- [ ] **Not yet done**: real-hardware validation (Windows, real Ollama installs, real editor installs) — see `MANUAL_TESTING.md`.
- [x] **Team config profiles** — commit a `rigup.yaml` at your repo root; `init` searches upward for it automatically (`src/teamProfile.ts`)
- [x] **Additional model families** — StarCoder2, CodeGemma, DeepSeek Coder V2 alongside the default Qwen2.5 Coder, all with verified real Ollama tags (`src/modelFamilies.ts`)

## Ollama server not actually running (the "fetch failed" problem)

If Kilo Code, Roo Code, Cline, or Continue.dev shows a connection/fetch
error even though Ollama is installed, that's a real gap this used to have:
`isOllamaAvailable()` only ever checked that the `ollama` **binary** exists
on PATH (`ollama --version`) — it never actually talked to the background
**server** on `localhost:11434`. Someone can have Ollama fully installed
with that check passing while the server itself isn't running (never
started, or was closed after a previous session).

Fixed with a genuinely separate check, `isServerReachable()` in
`src/ollama.ts`, which does a real HTTP request to `localhost:11434` rather
than asking the CLI about itself. `init` now runs this right after
confirming the binary is present — before pulling any models or writing
any config, since those need a live server too — and if it's not
reachable, tries to start it:

- **Linux**: `systemctl start ollama` first (the managed service the
  official install script sets up), falling back to a detached
  `ollama serve` if no such unit exists.
- **macOS**: launches `Ollama.app` (starts its embedded server the same as
  opening it manually), falling back to a detached `ollama serve` if the
  app isn't found under that name.
- **Everywhere else** (Windows, or any install that didn't match the above):
  spawns `ollama serve` directly, detached so it outlives the CLI process.

Either way, it then polls for reachability with the same bounded-retry,
honest-fallback pattern as the post-install auto-continue — if the server
genuinely never comes up, it says so and points at `ollama serve` as a
manual next step, rather than plowing ahead and pulling models against a
server that isn't there.

`doctor` got the same fix, split into two genuinely separate checks instead
of one that conflated them: "Ollama installed (binary on PATH)" and "Ollama
server reachable (localhost:11434)" — so it can now actually diagnose
exactly the situation that prompted this fix, instead of reporting green
on a binary check while the real problem (server down) went unmentioned.

## Model pull progress

`ollama pull`'s own progress output (percentage, download speed, size per
layer) now shows up directly while a model downloads — `src/ollama.ts`'s
`ensureModel()` runs the pull with `stdio: "inherit"` instead of piping and
relaying output itself. That change fixes a real bug: the previous version
only listened on the child process's `stdout`, and progress bars
conventionally get written to `stderr` — if Ollama does that, the old code
would have silently shown nothing during multi-gigabyte downloads.
Inheriting stdio sidesteps the guess entirely, the same way the Ollama
installer's own progress bar (`src/installer.ts`) already worked.

## Model families

`qwen2.5-coder` is still the default, but it's no longer the only option.

**Interactively**, `init` shows you what it recommends for your detected RAM
tier and lets you accept it, switch families, or type in model tags of your
own — the recommendation from `src/modelFamilies.ts`'s tier table is always
the pre-selected default, so hitting Enter just does the sensible thing:

```
🧠 Recommended for your 16gb tier: qwen2.5-coder:7b (chat/agent) + qwen2.5-coder:1.5b (autocomplete)
❯ ✅ Use the recommended models
  🔀 Pick a different model family
  ✏️  Enter model tags manually
```

Any submenu reached from here — the family picker, or the custom-tag text
prompts — can back out to this menu instead of aborting the whole command:
the family picker has an explicit "⬅ Go back" entry, and pressing Esc on
either custom-tag prompt returns here too. The same applies to the editor
picker's "Something else" follow-up prompt. This menu also has an
"⬅ Actually, change my editor" entry, which jumps all the way back to
editor selection and then re-shows this menu — the one place in the flow
where two genuinely separate top-level steps needed linking, since it's the
step furthest from editor selection. All of this is implemented as a loop
in `src/prompts.ts` / `src/commands/init.ts`, not a special case —
cancelling a submenu is treated as "step back one level," and only
cancelling a true top-level menu (nothing left to return to) exits the
command.

**Scope, stated plainly**: every `select`/`multiselect` prompt in the
codebase has back-navigation *somewhere it makes sense to have one* — the
uninstall command's target picker is the one exception, and deliberately
so: it's the first and only choice in that flow, a multiselect already lets
you freely toggle any item before submitting, and cancelling it already
safely does nothing (no partial state to "back out of"). Plain yes/no
confirmations (install Ollama? continue setup? delete model weights?)
don't get a separate back option either — declining *is* the back option
for a binary choice.

**Non-interactively** (scripts, CI, automation), pass `--family` and the
prompt is skipped entirely — an explicit flag is already an unambiguous
choice:

```bash
rigup init --family starcoder2       # or codegemma, deepseek-coder-v2
rigup switch chat 7b --family codegemma
```

Each family has its own per-tier recommendations — some don't cover every
tier (DeepSeek Coder V2 is a 16B-class model with no realistic 8gb-tier
variant), and resolution falls back to the lightest tier that family *does*
support, with an explicit warning rather than silently picking something.
`qwen2.5-coder`'s entries are tested against `detector.ts`'s existing
tiering to guard against the two drifting apart.

## Team config profiles

Commit `rigup.yaml` (see `rigup.example.yaml` for the format) at
your repo root, and `init` finds it automatically — searching upward from
wherever you run it, stopping at the first `.git` boundary so it doesn't
wander into unrelated folders on someone's machine. It can pin a
`modelFamily` for the whole team and override specific tier/model
combinations, while hardware detection still runs per-machine (someone on
an 8gb laptop and someone on 16gb both get appropriate models, just from
the same family). An explicit `--family` flag on the command line still
wins over the team profile, in case someone needs to deviate for a specific
reason.

## Config generation — what's automated vs. guided

**Continue.dev is fully automated**, both its config and now the extension
itself. It documents a single, stable, plain-file config format
(`~/.continue/config.yaml`, confirmed against Continue's own docs —
`config.json` is now deprecated), so `src/configWriter.ts` round-trip edits
it: parses the existing file with the `yaml` library, adds or updates
exactly two entries (tagged by name so re-running never duplicates them),
and writes it back — every other line, comment, and model entry the user
added themselves is left untouched. Separately, `init` now also offers to
install the Continue.dev extension itself via the editor's CLI
(`code --install-extension Continue.continue`, confirmed against
Continue's own marketplace listing and install scripts — see
`src/continueExtension.ts`), so the config file isn't sitting there inert
if the extension was never installed in the first place. `init` creates
the config, `switch` re-patches it.

**Kilo Code is fully automated too — config, extension, and connection.**
Earlier caution here was warranted — sources disagreed on where its config
actually lived (a `kilo.json` file, VS Code `settings.json`, or internal
SQLite state). Kilo's own docs (kilo.ai/docs/ai-providers/ollama,
kilo.ai/docs/code-with-ai/agents/custom-models) resolved that: global config
lives at `~/.config/kilo/kilo.jsonc` on **every** platform, including
Windows (not `%APPDATA%`, unlike most VS Code extensions), in JSONC
(JSON-with-comments) format. `src/kiloConfigWriter.ts` edits it the same
comment-preserving way — via `jsonc-parser`'s `modify`/`applyEdits`, the
same library VS Code itself uses for `settings.json` — setting the active
model, registering it under `provider.ollama.models`, and setting
`provider.ollama.options.baseURL` to `http://localhost:11434/v1`, without
touching any other provider or comment already in the file.

That `/v1` suffix matters and was genuinely missed at first: Kilo's local-
Ollama path uses an OpenAI-compatible client that calls `/chat/completions`,
a route Ollama only exposes under `/v1` — the bare root 404s. This was
caught by testing against a **real, running Ollama daemon**, not just
reading docs, and is now applied both in `kiloConfigWriter.ts`'s auto-write
and in the guided manual steps (`src/agentExtensionGuide.ts`) for anyone
following them by hand for Roo Code or Cline instead.

One thing the writer deliberately does **not** do: set `tool_call` or
`limit.context`/`limit.output` on the registered model. Those are real
per-model facts — does this specific tag support function calling? what's
its actual trained context window? — that vary across model families and
aren't safe to guess. Kilo's own catalog fills in defaults when it
recognizes the model; for anything it doesn't, that's left for you to set
once you know how the model behaves, rather than RigUp AI asserting facts
about it that might be wrong.

**Installing the extension itself is a different, safer operation than
writing its config** — `code --install-extension <id>` (and Cursor's
`cursor --install-extension`, Windsurf's `windsurf --install-extension`,
VSCodium's `codium --install-extension`) is a well-documented, stable CLI
contract across the whole VS Code-family ecosystem. `src/offerExtensionInstall.ts`
is the shared flow behind both Continue.dev and Kilo Code: it first checks
`--list-extensions` (`isExtensionInstalledViaCli` in `src/editorCli.ts`) so
an extension installed-but-never-opened isn't offered again even if the
globalStorage-based scan (`discoverAgentExtensions`) found nothing yet;
otherwise, if the editor's CLI is on PATH (from running "Shell Command:
Install '\<editor>' in PATH" once from the command palette — a one-time
opt-in step RigUp AI can't trigger on its own), it offers to install.
Either way Kilo Code ends up present, `init` configures it and sends a real
test prompt (see below). If the CLI isn't on PATH, it says so specifically
rather than failing silently, and points at the exact command-palette step
that would enable it next time.

**Roo Code and Cline remain guided-only** — the same first-party
confirmation Kilo Code got was never found for these two (Roo Code is
discontinued anyway; Cline's config storage wasn't specifically
investigated), so they still get the accurate manual Settings-panel steps
from `src/agentExtensionGuide.ts` instead of a writer.

## Testing the connection with a real prompt

After configuring Kilo Code (whichever path got it there — freshly
installed via the editor CLI, or already present), `init`/`switch` send an
actual generation request to `http://127.0.0.1:11434/api/generate` with
the exact model just configured and report whether it responded. This is a
genuinely different check from `isServerReachable()` — a server can be up
and answering pings while a specific model isn't pulled, is still loading,
or fails for some other reason, and this is what catches that. It exercises
the same server+model path Kilo Code's UI would use — the one thing this
*can't* do is literally drive Kilo Code's own chat interface and click
send, since that's outside what a CLI tool can reach; the test prompt is
the closest automatable equivalent to "does this actually work."

## Uninstalling

```bash
rigup uninstall
```

Opens a multi-select — pick any combination of:

- **🗂️ RigUp AI settings** (`~/.rigup`) — low-risk, no elevated privileges needed
- **🧠 Models RigUp AI pulled** — runs `ollama rm` on whatever's recorded in state
- **🦙 Ollama itself** — the whole local AI server, including its background service

Picking nothing removes nothing — a plain Ctrl+C or empty selection exits cleanly.

The Ollama-removal option is deliberately harder to trigger than a yes/no: it
requires typing `uninstall ollama` exactly before anything runs, since a
reflexive "y" is too easy to hit for something this irreversible. The actual
teardown commands live in `src/uninstallPlan.ts` as data (not inline in the
command), specifically so they're unit-testable without executing real `sudo`
commands — see `src/__tests__/uninstallPlan.test.ts`.

Platform behavior differs on purpose:
- **macOS/Linux**: runs the reverse of the official install script (stop the
  service, remove the systemd unit on Linux, remove the binary/app bundle) —
  each step is wrapped so a missing piece (e.g. no systemd service if you
  installed some other way) doesn't abort the rest.
- **Windows**: there's no single documented uninstaller entry point to trust,
  so rather than guessing a path and silently doing nothing (or worse,
  deleting the wrong thing), it opens Windows's own "Apps & Features" panel
  for you to finish it there.

Deleting the actual downloaded model weights (`~/.ollama`, often the largest
chunk of disk space) is a separate confirmation on top of removing Ollama
itself, not bundled in automatically.

## ⚠️ Roo Code was discontinued — read this before you build on it

While tracking down the "placeholder" ID issue, it turned out Roo Code itself
was **archived and discontinued on May 15, 2026** — the team pivoted to a
cloud product ("Roomote"), and the actively maintained successor most new
users will have installed is **Kilo Code** (a fork of Roo Code). Cline (the
project Roo originally forked from) is also still active.

Rather than hardcoding one guessed extension ID and hoping it's still right,
`src/agentExtensions.ts` now holds a small registry of known candidates —
Kilo Code, Cline, and Roo Code (flagged discontinued) — and
`src/extensionDiscovery.ts` scans the editor's `globalStorage` directory
against that list. `rigup doctor` reports whichever one it actually
finds installed, with a clear warning if it's the discontinued one. This
means the next ecosystem shift just needs a new entry in
`KNOWN_AGENT_EXTENSIONS`, not a rewrite of the detection logic. Verified
end-to-end against real fake-home directories for both Kilo Code and
Roo Code — see the test suite.

## Editor support

This was originally built VS Code-only, which was a real gap — plenty of
people (Cursor users especially) don't use plain VS Code. `init` now opens
with a picker:

```
🎨 Which editor are you using?
❯ 💙  VS Code
  🌟  Cursor
  🏄  Windsurf
  🔷  VSCodium
  🎛️   Something else
```

Cursor, Windsurf, and VSCodium are all VS Code forks with the same
`globalStorage` layout — they just live under their own app-data folder name
(`Cursor`, `Windsurf`, `VSCodium` instead of `Code`). `src/paths.ts` resolves
this per-editor, per-OS, so nothing downstream has to special-case it.
Picking "Something else" asks for the app-data folder name directly, so any
future VS Code fork works without a code change.

Verified specifically for Cursor: `%APPDATA%\Cursor\User` on Windows,
`~/Library/Application Support/Cursor/User` on macOS,
`~/.config/Cursor/User` on Linux.

## Platform support

Windows is a first-class target here, not an afterthought — the audience for
this tool (8–16GB laptops running local coding models) very much includes
Windows developers, so every module is built to work identically on
Windows, macOS, and Linux:

- **Hardware detection** (`os.totalmem()`/`os.platform()`) is native Node —
  identical behavior on all three.
- **Ollama install**: macOS/Linux run the official `curl | sh` script;
  Windows has no equivalent silent installer, so `installer.ts` downloads
  `OllamaSetup.exe` directly (with its own progress bar) and launches it —
  no WSL required.
- **Model pulls, health checks, running-model detection**: all shell out to
  the `ollama` binary itself via `execa`, which resolves `.exe` on Windows
  the same way it resolves the Unix binary — no platform branching needed.
- **Config paths**: `src/paths.ts` centralizes every OS-specific path
  (VS Code's `globalStorage` differs: `%APPDATA%\Code\User` on Windows,
  `~/Library/Application Support/Code/User` on macOS, `~/.config/Code/User`
  on Linux) so no other module has to special-case `process.platform`
  itself. Verified against VS Code's documented storage locations.
- **Not yet tested on a real Windows machine** — the install/download path
  and `execa` binary resolution should work as described, but this hasn't
  been run on actual Windows hardware yet. Worth validating before you rely
  on it.

## Setup

```bash
npm install    # this builds and links `rigup` globally automatically — see below
```

That's it — `rigup doctor` (or any other command) should work directly
in your shell afterward. If you'd rather not have `npm install` register a
global command, set `RIGUP_SKIP_POSTINSTALL=1` first, or run
`npm run dev -- doctor` instead (works without any linking, always).

```bash
npm run dev -- --help    # run from source via tsx, no install needed
npm run dev               # bare invocation — opens the interactive command picker
npm test                 # run the full unit test suite (141 tests)
npm run typecheck
```

Works the same way in PowerShell, cmd, or a Unix shell — no OS-specific setup steps.

### How the automatic linking works

`scripts/postinstall.mjs` runs after every `npm install` (`package.json`'s
`postinstall` script) and does three things in order, verified end-to-end
in a real fresh install, not just assumed to work:

1. **Builds** (`npm run build`) — compiles to `dist/index.js`.
2. **Links** (`npm link`) — symlinks it into your global npm bin so
   `rigup` resolves as a real shell command.
3. **Verifies** — actually runs `rigup --version` afterward and
   reports whether it's genuinely on PATH, rather than assuming success
   just because `npm link` didn't error. A stale PATH is a common enough
   reason those two can disagree.

It's deliberately cautious about a few things that could otherwise go
wrong silently:

- **Never breaks `npm install` itself** — every failure path (build fails,
  `npm link` needs elevated permissions, PATH doesn't pick it up) prints a
  clear manual fallback and exits cleanly, since `npm run dev` still works
  regardless of whether linking succeeded.
- **Won't hijack a nested install** — if this package is ever installed as
  a dependency inside another project (nested under that project's own
  `node_modules`), it skips entirely rather than surprising someone by
  registering a global `rigup` command they didn't ask for.
- **Guards against `npm link` re-triggering itself** — npm can run a
  package's own lifecycle scripts again as part of linking in some
  versions; an environment-variable guard makes a re-entrant call a no-op
  instead of looping.
- **Skips in CI** (`CI` env var) automatically, and skips anywhere with
  `RIGUP_SKIP_POSTINSTALL=1` set.

Re-run it manually anytime with `npm run link-cli` (same script, useful
after switching Node versions or if you ever `npm unlink -g rigup-ai`
and want it back) — you don't need to `npm link` by hand for routine
changes, since `npm run build` alone already refreshes what the existing
symlink points to.

Running the CLI with no subcommand (`rigup`, or `npm run dev` with no
args) opens an interactive picker (`src/launcher.ts`) listing every command
with its description, and prompts for any required arguments `switch` or
`guard` need — no more remembering exact flag syntax for the rare
commands. Every subcommand also still works directly
(`rigup switch chat 7b`, `rigup init --family starcoder2`, etc.)
exactly as before; the launcher is an additional entry point, not a
replacement.

Want a binary that runs without Node installed at all? Wrap the
`npm run build` output with `pkg` or `bun build --compile` (including a
Windows `.exe`).

## What's left

See `MANUAL_TESTING.md` for the full checklist. Everything else from the
original design spec is now implemented — real-hardware validation across
Windows/macOS/Linux with a real Ollama + editor install is the one
remaining gap, and it's inherently something only a human on real hardware
can do.

## Roadmap

Planned work is in [ROADMAP.md](./ROADMAP.md).

## Design reference

See the accompanying `rigup-ai-design-and-spec.md` for the full system design
(component diagram, data model, CLI contract) and product spec (goals, non-goals,
requirements, success metrics).

## License

[MIT](./LICENSE) © Justice Otuya
