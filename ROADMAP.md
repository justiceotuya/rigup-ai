# Roadmap

Planned work on RigUp AI, roughly in priority order. Estimates are for my own pace.

## Next up

- [ ] **Real-hardware validation** (~6h): work through `MANUAL_TESTING.md` on macOS (Apple Silicon), Linux and Windows with real Ollama and editor installs; fix whatever breaks and record results in the repo.
- [ ] **CI** (~2h): GitHub Actions running `vitest`, `tsc --noEmit` and a build on macOS, Linux and Windows runners.
- [ ] **Publish to npm** (~3h): release `rigup-ai` so `npx rigup-ai init` works without cloning. Stop the postinstall script from running global `npm link` for npm installs, and add a changelog and release workflow.
- [ ] **GPU-aware tiering** (~5h): detect Apple unified memory, NVIDIA/AMD VRAM, and add 32 GB+ tiers so bigger machines get bigger models instead of the 16 GB ceiling.

## Integrations

- [ ] **Configure `ollama launch` targets** (~4h): offer Claude Code / Codex / OpenCode via Ollama's own launcher alongside the editor extensions, so RigUp AI covers terminal agents too.
- [ ] **Cline config writer** (~4h): auto-configure Cline once a stable, documented settings location is confirmed (it's guided-setup only today).
- [ ] **JetBrains + Zed support** (~6h): Continue.dev's JetBrains plugin and Zed's Ollama provider.
- [ ] **LM Studio / llama.cpp backends** (~6h): optional alternative to Ollama for people who already run them.

## Reliability & UX

- [ ] **`guard` as a background service** (~4h): launchd/systemd/Task Scheduler instead of a foreground watcher.
- [ ] **Model benchmark on init** (~3h): time a short generation and suggest a smaller model if tokens/sec is too low.
- [ ] **Non-interactive mode** (~2h): `rigup init --yes --editor vscode --tier 16gb` for scripted and CI setups.
- [ ] **Legacy cleanup** (~1h): offer to move `~/.localstack` to `~/.rigup` and remove old `LocalStack — …` entries.
