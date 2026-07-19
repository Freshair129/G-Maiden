# G-Maiden

A real-time AI companion and co-pilot for Dota 2 that narrates and advises during live matches via voice and a transparent on-screen overlay. Reads live game data through Valve's Game State Integration (GSI) and reacts within strict latency budgets without disrupting player focus.

Inspired by Crystal Maiden from Dota 2, Maiden delivers statistically credible, gentle advice with meme-aware self-deprecation and belief revision—audibly correcting predictions mid-sentence when they diverge from live match reality.

## Architecture

Hybrid client-server design split by latency requirements:
- **Local Gateway (G-Sensory)** – receives GSI data, processes minimap vision, emits ultra-low-latency gank warnings via local SLM
- **Cloud Brain (Maiden Scribe)** – drives live-caster persona and deep strategic analysis via Claude API (Anthropic) with Ollama local-SLM fallback

## G-Series Modules

| Module | Responsibility |
| --- | --- |
| **G-Sentry** | Fog-of-war monitor; flags enemies missing from vision >5s |
| **G-Motion** | Heatmap and path prediction; keeps 5-min last-seen positions, predicts gank routes |
| **G-Signal** | Real-time gank warning; voice interrupt when danger >85% (hard-latency path) |
| **G-Master** | Strategic/financial advisor; skill and item build advice vs. enemy Net Worth |
| **G-Sensory** | Overlay rendering and hardware optimization (glassmorphism HUD, FPS budget) |
| **G-Log** | Feedback loop; logs decisions locally to tune prediction parameters next match |

## Tech Stack

- **Tauri v2** desktop framework (Rust + WebView2 backend)
- **React 18** + **Vite** frontend (TypeScript)
- **Rust** backend with DXGI screen capture and GSI/cloud integration
- **Claude API** (Anthropic) for cloud reasoning; **Ollama** for resilient local inference
- **Windows SAPI** for text-to-speech (Piper ONNX planned)

## Build & Test

```bash
# Rust backend tests (from src-tauri/)
cargo test

# TypeScript type checking (from src/)
npx tsc --noEmit

# Frontend unit tests (from src/)
pnpm -C src test

# Build distributable binary (from repo root)
pnpm tauri build
```

## Releases

The app receives updates via **in-app updater** (Tauri updater plugin). Releases are cut **only by CI** on a pushed version tag—never by plain commit.

To release: bump the version in every file listed under "Release & update workflow" in **CLAUDE.md** (kept there as the single source of truth to avoid drift); add a CHANGELOG entry; commit; then `git tag -a vX.Y.Z && git push origin vX.Y.Z`. CI builds, signs, and publishes the GitHub Release (~13 min).

## Documentation

- **[docs/product/product-requirements.md](docs/product/product-requirements.md)** – vision, modules, and design decisions (Thai)
- **[docs/product/software-requirements-specification.md](docs/product/software-requirements-specification.md)** – functional/non-functional requirements, performance budgets, external interfaces (Thai)
- **[docs/README.md](docs/README.md)** – complete documentation index

See **CLAUDE.md** for code-level contributor guidance, ADRs, and architecture rules.

## License

Proprietary. All rights reserved. See [LICENSE](LICENSE) for details.
