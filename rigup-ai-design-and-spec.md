# RigUp AI — System Design & Spec
*Turning "here's my manual local AI coding stack" into a repeatable tool*

Source: a thread describing a local, $0, offline AI coding setup —
Ollama (model server) + Continue.dev (chat/autocomplete in VS Code) +
Roo Code (agentic multi-file edits) + optional Aider (CLI architecture work),
tuned by RAM tier (8GB → 3B/1.5B models, 16GB+ → 7B).

---

## Part 1 — System Design

### 1. Requirements

**Functional**
- Detect the host machine's RAM and OS.
- Recommend and pull the right Ollama models for that RAM tier (1.5B for autocomplete, 3B or 7B for chat/agent).
- Generate/patch config files for Continue.dev and Roo Code so they point at `localhost:11434` with the right model assignments, without hand-editing JSON.
- Optionally set up Aider with the matching model alias.
- Enforce "one memory-hungry job at a time" — warn or block launching a second heavy model process while one is already resident.
- Provide a health-check command that re-validates the setup (models present, Ollama reachable, VS Code extensions installed).

**Non-functional**
- Must work fully offline after initial model pull (no telemetry, no external calls at runtime).
- Setup should complete in one command, target < 10 minutes excluding model download time.
- Must run on the exact constrained hardware it's designed for (8–16GB laptops) without itself becoming a memory hog.
- Cross-platform: macOS and Linux first (matches the primary dev audience); Windows/WSL as a fast-follow.

**Constraints**
- Solo/small-team build, no backend infrastructure (the whole point is $0 and local).
- Depends on three external projects (Ollama, Continue.dev, Roo Code) whose config formats can change — design for that.
- No budget for a hosted model registry; rely on Ollama's own registry.

### 2. High-Level Design

```
                        ┌────────────────────────┐
                        │   RigUp AI CLI        │
                        │  (single Go/Node binary)│
                        └───────────┬─────────────┘
                                    │
        ┌───────────────┬──────────┼───────────────┬─────────────────┐
        │                │          │               │                 │
        ▼                ▼          ▼               ▼                 ▼
 ┌─────────────┐  ┌─────────────┐ ┌───────────┐ ┌───────────────┐ ┌────────────┐
 │ HW Detector │  │ Model        │ │ Config     │ │ Process/RAM    │ │ Doctor /   │
 │ (RAM/OS/    │  │ Provisioner  │ │ Writer     │ │ Guard          │ │ Health     │
 │  GPU probe) │  │ (ollama pull)│ │ (Continue, │ │ (watch running │ │ Check      │
 │             │  │              │ │  Roo, Aider)│ │  model procs)  │ │            │
 └─────────────┘  └──────┬───────┘ └─────┬─────┘ └───────┬────────┘ └─────┬──────┘
                          │               │               │                │
                          ▼               ▼               ▼                ▼
                  ┌────────────┐  ┌───────────────┐ ┌────────────┐ ┌──────────────┐
                  │ Ollama      │  │ ~/.continue/  │ │ local OS    │ │ stdout       │
                  │ (localhost  │  │ config.json   │ │ process     │ │ report       │
                  │  :11434)    │  │ .roo/config   │ │ list        │ │ (JSON/human) │
                  └────────────┘  │ .aider.conf   │ └────────────┘ └──────────────┘
                                   └───────────────┘
```

Everything runs as local processes talking to `localhost:11434`. RigUp AI itself is stateless between invocations — it reads machine state and existing config, writes config, and exits. No daemon required for v1 (the RAM guard can start as a lightweight opt-in background check rather than a persistent service).

### 3. Deep Dive

**Data model** — a single local manifest, `~/.rigup/state.json`:
```json
{
  "ram_gb": 16,
  "os": "darwin",
  "tier": "16gb",
  "models": {
    "chat_agent": "qwen2.5-coder:7b",
    "autocomplete": "qwen2.5-coder:1.5b"
  },
  "integrations": {
    "continue": { "configured": true, "path": "~/.continue/config.json" },
    "roo_code": { "configured": true, "path": "~/.vscode/roo-code.json" },
    "aider": { "configured": false }
  },
  "last_health_check": "2026-08-09T10:00:00Z"
}
```

**CLI surface (API contract)**
```
rigup init                 # detect hardware, pull models, write configs
rigup init --tier 8gb      # override auto-detected tier
rigup doctor               # re-validate: ollama reachable, models present, configs valid
rigup switch chat 7b       # swap the chat/agent model without full re-init
rigup guard start|stop     # optional RAM-contention watcher
rigup aider                # launch aider pre-wired to the configured model
```

**Model tiering logic**
- < 8GB: warn — recommend 1.5B only, agent features disabled (not enough headroom for Roo Code's context needs).
- 8GB: `qwen2.5-coder:3b` (chat/agent) + `qwen2.5-coder:1.5b` (autocomplete).
- ≥16GB: `qwen2.5-coder:7b` (chat/agent) + `qwen2.5-coder:1.5b` (autocomplete).
- Detection should be conservative (leave headroom for VS Code + OS), not just `total_ram`.

**RAM guard** — polls `ollama ps` (or OS process list) every N seconds; if two memory-heavy jobs are detected concurrently (e.g., Roo Code agent run + a fresh Aider session both holding a 7B model resident), surface a terminal/OS notification rather than silently degrading performance.

**Error handling**
- Ollama not installed → offer to install (with explicit confirmation, since it's a system-level install) or print manual instructions.
- Model pull fails (offline, disk space) → retry with backoff, fall back to smaller tier, never partially write config pointing at a missing model.
- Existing user config detected → diff and ask before overwriting, never clobber silently.

### 4. Scale & Reliability

This is explicitly a single-user, single-machine tool — "scale" here means robustness across hardware/OS variance, not concurrent users:
- Test matrix: macOS (Intel/Apple Silicon), Ubuntu, Windows/WSL; 8GB/16GB/32GB RAM tiers.
- Model registry availability is Ollama's problem, not ours — but `rigup doctor` should clearly surface "Ollama unreachable" vs "model missing" vs "config invalid" as distinct failure modes, since users will self-debug from CLI output alone.
- No crash-safety concerns beyond standard CLI idempotency: every command should be safely re-runnable.

### 5. Trade-offs

| Decision | Trade-off |
|---|---|
| No daemon/background service by default | Simpler, safer, no telemetry surface — but the RAM guard is opt-in and manual rather than automatic |
| Config *writer* instead of a Continue/Roo fork | Stays compatible as those tools evolve, but breaks if they change config schema — needs a compatibility test in CI against pinned versions |
| CLI-first, no GUI in v1 | Faster to ship, matches the audience (developers who read Twitter threads about Ollama configs), but raises the bar for non-CLI-comfortable users |
| Bundling Aider as optional, not default | Keeps core install lean; revisit if usage data shows most users want it |

**What to revisit as it grows:** if adoption clusters around teams (not just solo devs), a shared config profile (`rigup.yaml` checked into a repo so a whole team gets the same tiered setup) becomes the natural v2 — but that's explicitly out of scope for v1 below.

---

## Part 2 — Product Spec (PRD)

### Problem Statement
Developers who want a local, offline, $0 AI coding stack currently have to manually research RAM-appropriate models, hand-edit config files for multiple tools, and remember discipline like "close Roo Code before starting a new chat" to avoid crashing their laptop. This friction means most people who see a thread like this never actually set the stack up, or set it up once and let it drift out of sync as tools update.

### Goals
1. Reduce time from "I want this" to "working local AI coding stack" to under 10 minutes of hands-on time.
2. Eliminate manual JSON config editing for Continue.dev, Roo Code, and Aider.
3. Prevent RAM-exhaustion crashes caused by running multiple heavy local models simultaneously.
4. Make the setup auditable and repeatable (`rigup doctor` gives a clear pass/fail, anytime).
5. Zero telemetry, zero network calls beyond the initial model pull — preserve the core value prop of the original stack.

### Non-Goals
- **Not a hosted service or SaaS.** Defeats the $0/offline premise — explicitly local-only.
- **Not a replacement for Continue.dev, Roo Code, or Aider.** RigUp AI configures them; it doesn't reimplement their functionality.
- **Not a model router that picks cloud vs. local per-query.** v1 assumes the user has already decided "local for this task."
- **Not multi-user/team config sync in v1.** Single-machine only for now.
- **Not GPU-cluster or workstation-tier support in v1.** Scoped to the 8–16GB laptop case the original thread targets.

### User Stories
- As a developer with an 8GB laptop, I want the tool to automatically pick models that fit my RAM, so I don't crash my machine guessing.
- As a developer switching from an 8GB to a 16GB machine, I want to upgrade my model tier with one command, so I don't have to redo the whole setup.
- As a developer, I want a single health-check command, so I can confirm my setup still works after a tool update without re-reading the original thread.
- As a developer running an agentic Roo Code session, I want to be warned if I'm about to start a second heavy model job, so I don't hit OOM mid-refactor.
- As a privacy-conscious developer, I want confidence that nothing here phones home, so I can trust the "your code stays yours" claim.

### Requirements

**Must-Have (P0)**
- Hardware detection (RAM, OS) with manual override.
- Model provisioning via `ollama pull` for the detected tier.
- Config generation for Continue.dev and Roo Code.
- `rigup doctor` health check with clear, distinct failure states.
- No network calls except model pulls from the Ollama registry.

**Nice-to-Have (P1)**
- Aider integration (`rigup aider` launcher).
- RAM guard with terminal notification when two heavy jobs overlap.
- `rigup switch` to change model tier without full re-init.

**Future Considerations (P2)**
- Windows-native (non-WSL) support.
- Shared team config profile (`rigup.yaml` in-repo).
- Support for model families beyond qwen2.5-coder as new local coding models ship.

### Success Metrics
- **Leading:** % of users who run `rigup doctor` successfully within 24 hours of `init` (setup actually worked); median time-to-working-setup.
- **Leading:** repeat CLI invocations per user in week 1 (signal that it's a tool, not a one-time script).
- **Lagging:** GitHub stars/installs sustained month-over-month (proxy for real retention, since there's no telemetry to measure usage directly — by design).

### Open Questions
- Should model recommendations be pinned to specific Ollama tags, or track "latest" for the qwen2.5-coder family? (engineering)
- Is Windows/WSL a P0 given the audience, or genuinely fine as a fast-follow? (product)
- Does the RAM guard need OS-level process introspection permissions that will trigger security prompts, and is that an acceptable UX cost? (engineering)

### Timeline Considerations
- No hard external deadline. Natural phase-in: ship CLI `init` + `doctor` for macOS/Linux first (validates the core value prop cheaply), add Aider + RAM guard once initial usage confirms retention, revisit Windows and team-config based on demand signal.
