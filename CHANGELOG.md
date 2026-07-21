# Changelog

All notable changes to this project are documented here.

## [0.1.0] — 2026-07-21

First public release.

### Added
- `parse` — turn a ChatGPT or Claude data export into clean, human-readable Markdown memory files.
  Auto-detects the source; reads custom instructions and profile from the export; accepts pasted
  saved memories (`--memories`) for ChatGPT, whose export omits the memory store (Claude's
  exported memory is read natively — see below); optional inferred `derived` candidates
  (`--include-derived`).
- `audit` — flag stale, contradictory, sensitive, and third-party items with a deterministic,
  offline, explainable rubric. Writes a full local report and an opt-in redacted, shareable card
  (`--card`) that contains no raw memory text.
- `push` — vendor-neutral interface to send parsed memory to a target. Tempreon target ships with
  `--dry-run` only in v0.1 (no live network call); see `docs/adr/0003`.
- Emitters: `markdown` (default) and `json`, behind a format-agnostic layer; an `omp` extension
  point stub (see `docs/adr/0002`).
- Library API (`import { parseExport, runAudit } from 'memhaul'`).
- Synthetic test fixtures and a full test suite; strict TypeScript; CI on Node 22 + 24.
- Static channel attribution (`utm_source=memhaul`) on the printed Tempreon links, so web-side
  analytics can tell CLI-originated visits apart. The parameter is constant — no user data.
- Chunked ChatGPT exports: the Privacy Portal path splits large histories into
  `conversations-000.json`, `conversations-001.json`, …; all chunks are now detected and merged
  in order instead of only the exact `conversations.json` name being read.
- Native Claude memory: Claude exports now include a `memories.json` (account memory, per-project
  memory, and structured `memory_files` with paths + timestamps). memhaul reads it directly, so a
  plain `parse` brings your memory through with no paste. Per-project instructions are read from the
  `projects/<uuid>.json` directory (legacy single `projects.json` still supported); `--memories`
  stays as an additive supplement and as the fallback for older exports. The stale "Claude doesn't
  export memory" copy is corrected across the README, the adapter, and the docs.
- Multi-batch Claude exports: pointed at one `…-batch-0000.zip`, memhaul now merges its
  `…-batch-NNNN.zip` siblings so nothing after the first batch is silently dropped.
- ChatGPT custom instructions: newer ChatGPT exports no longer embed custom instructions in
  conversation metadata, so the recovery path finds nothing on a fresh export. Added `--instructions
  <file>` to paste them in (from Settings → Personalization → Custom instructions), tolerant of both
  the labeled two-box format and an unlabeled paste; the metadata path still runs for older exports
  but is no longer advertised as the expected outcome. When no instructions are found and none are
  pasted, the run now says so and points at the paste route. README quickstart updated to match a
  fresh export.

### Changed
- Runtime floor raised from Node 18 to Node **20** (`engines`): Node 18 and 20 are both past LTS,
  but the CLI uses no APIs newer than Node 20, so a still-installed Node 20 parses fine. Tested on
  Node 22 and 24; a `>=22` floor will be reconsidered at v0.2. README and CONTRIBUTING updated to
  match.
- CI actions bumped to the current majors that target the Node 24 runner runtime
  (`actions/checkout@v7`, `actions/setup-node@v7` in `ci.yml` and `release.yml`), clearing the
  "Node.js 20 is deprecated" runner annotations.

### Guarantees
- `parse` and `audit` make no network calls. No telemetry. One runtime dependency (`fflate`).
- Reads are non-destructive; output is deterministic and diffable.
