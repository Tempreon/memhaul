# Changelog

All notable changes to this project are documented here.

## [0.1.0] — unreleased

First working version. Built-not-launched.

### Added
- `parse` — turn a ChatGPT or Claude data export into clean, human-readable Markdown memory files.
  Auto-detects the source; reads custom instructions and profile from the export; accepts pasted
  saved memories (`--memories`) since ChatGPT and Claude do not export the memory store itself;
  optional inferred `derived` candidates (`--include-derived`).
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

### Guarantees
- `parse` and `audit` make no network calls. No telemetry. One runtime dependency (`fflate`).
- Reads are non-destructive; output is deterministic and diffable.
